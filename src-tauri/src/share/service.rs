//! The running 共享服务: the port it took, the thread serving it, and the two
//! answers a request can get.
//!
//! The service owns a thread and a runtime of its own rather than borrowing the
//! application's. That is what makes ending it deterministic: `end` signals the
//! accept loop, joins the thread, and returns only once the thread is gone — and
//! a thread that is gone has dropped its listener, so the port is free by the
//! time the caller is told the service stopped. Handing the work to the
//! application's runtime would leave the port to be released at some later point
//! nobody can wait for, and "stopped" would be a claim rather than a fact.
//!
//! The runtime is built inside that thread, and dropped inside it too. A runtime
//! cannot be dropped from within an asynchronous context, and the commands that
//! end the service run in one — so the runtime never exists on the caller's side
//! of the boundary at all.

use std::convert::Infallible;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use dav_server::fakels::FakeLs;
use dav_server::{body::Body, DavHandler};
use http::{header, Request, Response, StatusCode};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::rt::TokioIo;
use tokio::sync::oneshot;

use crate::error::AppError;

use super::activity::{Activity, Device};
use super::credentials::{Credentials, CHALLENGE};
use super::fs::ShareFs;
use super::landing;

/// The port a WebDAV service is registered on, and the one this application
/// asks for first. Which port was actually taken is a separate fact, and the one
/// the interface shows.
pub(crate) const DEFAULT_PORT: u16 = 4918;

/// How many ports are tried, starting at the one asked for.
///
/// 4918 is a convention rather than a reservation, and whatever else on the
/// machine has taken it is no reason the user cannot share: the service moves
/// along until it finds one, and the interface shows the one it ended up on. A
/// machine where ten ports in a row are all taken has a problem that a wider
/// range would not fix.
pub(crate) const PORT_ATTEMPTS: u16 = 10;

/// A service listening on a port, until it is ended.
pub(crate) struct Service {
    port: u16,
    missing: usize,
    /// The 共享清单 this service was started over, kept so that it can be told
    /// apart from the list as it stands now. It is the whole of what "the list
    /// has changed under a running service" can be decided from: the interface
    /// is shown a service that would offer something other than what the user
    /// has picked, and the only other way to know that is to ask the user what
    /// they did, which misses every change they did not make by hand.
    paths: Vec<String>,
    /// The credentials this service answers to, held here and not read again:
    /// the password can be regenerated while the service is running, and a
    /// service that read the preferences per request would start accepting a
    /// password the interface had just told the user it was not yet using.
    credentials: Credentials,
    /// Held here and on the serving thread at once: the thread writes to it as
    /// requests arrive, and the slot reads it to answer the interface.
    activity: Arc<Activity>,
    ending: oneshot::Sender<()>,
    thread: std::thread::JoinHandle<()>,
}

impl Service {
    /// Binds the port and starts serving on it.
    ///
    /// The bind happens here, on the caller's thread, rather than inside the
    /// thread that will serve: a port that cannot be taken has to be reported to
    /// whoever asked for the service, and a failure discovered on another thread
    /// arrives after the interface has already been told it is running.
    ///
    /// `requested` is the port to take, or `None` to let the operating system
    /// choose one. The tests ask for the latter, so that two of them cannot
    /// collide on a port neither owns; the interface always names one, and the
    /// service moves along to the next free port rather than failing when it is
    /// held.
    ///
    /// `paths` is the 共享清单, in path order. Reading it into the filesystem
    /// happens here rather than on the serving thread for the same reason the
    /// bind does: what the list came to — how many videos it holds, how many of
    /// them are no longer on disk — is part of the answer the caller is given.
    pub(crate) fn start(
        requested: Option<u16>,
        language: &str,
        paths: &[String],
        credentials: Credentials,
    ) -> Result<Self, AppError> {
        let listener = bind(requested)?;
        let port = listener
            .local_addr()
            .map_err(|error| AppError::new("share.start.failed", error))?
            .port();
        listener
            .set_nonblocking(true)
            .map_err(|error| AppError::new("share.start.failed", error))?;
        let files = ShareFs::build(paths);
        let missing = files.missing();
        let paths = paths.to_vec();
        let activity = Arc::new(Activity::default());
        let endpoints = Endpoints {
            webdav: dav_handler(files),
            landing: landing::page(language),
            credentials: credentials.clone(),
            activity: Arc::clone(&activity),
        };
        let (ending, signal) = oneshot::channel();
        let thread = std::thread::spawn(move || serve(listener, signal, endpoints));
        Ok(Self {
            port,
            missing,
            paths,
            credentials,
            activity,
            ending,
            thread,
        })
    }

    /// The port the service actually took, which is not always the one asked
    /// for: `None` asks for the system's own choice.
    pub(crate) fn port(&self) -> u16 {
        self.port
    }

    /// How many videos on the list this service cannot offer, because their file
    /// is not on disk.
    pub(crate) fn missing(&self) -> usize {
        self.missing
    }

    /// The 共享清单 this service is offering, as it was when it started.
    pub(crate) fn paths(&self) -> &[String] {
        &self.paths
    }

    /// The credentials this service is answering to, which are the ones stored
    /// when it started and not the ones stored now.
    pub(crate) fn credentials(&self) -> &Credentials {
        &self.credentials
    }

    /// The clients heard from in the last minute, as of now.
    pub(crate) fn devices(&self) -> Vec<Device> {
        self.activity.recent(std::time::SystemTime::now())
    }

    /// Ends the service and returns once the port is free again.
    ///
    /// Consuming rather than taking a flag, because there is nothing left to do
    /// with a service that has been ended, and the two ways to be wrong about
    /// that — ending one twice, using one after ending it — stop being
    /// expressible.
    pub(crate) fn end(self) {
        // The signal first: the join below is what makes this synchronous, and
        // it only returns quickly because the accept loop is waiting on this
        // rather than on the next connection.
        let _ = self.ending.send(());
        let _ = self.thread.join();
    }
}

/// Binds the address the service listens on, or says why it could not.
///
/// Everything on the local network and nothing off it: the addresses a space is
/// reachable at are the machine's own, and a request arriving on any of them is
/// the same request. Which one a device should be told to use is the interface's
/// question, and it is answered from the machine's interfaces rather than here.
///
/// `requested` is where the search starts, and the ports just after it are tried
/// in turn: a port the machine asked for is a preference, and one that something
/// else holds is not a reason to refuse to share. Which port was taken is read
/// back from the listener rather than assumed from this argument, which is what
/// keeps the number the interface shows the number that works.
///
/// `None` asks the operating system to choose, and does not search: it is the
/// tests that ask that way, so that two of them cannot collide on a port neither
/// owns.
fn bind(requested: Option<u16>) -> Result<std::net::TcpListener, AppError> {
    let Some(base) = requested else {
        return bind_one(0).map_err(|error| AppError::new("share.start.failed", error));
    };
    // Taken from a range rather than counted up, because the range ends at the
    // last number a port can be: asking for the ten after 65530 is asking for
    // five, and the count that goes into the message has to be the one that was
    // actually tried.
    let mut tried = 0;
    let mut last = None;
    let mut held = false;
    for port in (base..).take(usize::from(PORT_ATTEMPTS)) {
        tried += 1;
        match bind_one(port) {
            Ok(listener) => return Ok(listener),
            Err(error) => {
                held |= error.kind() == std::io::ErrorKind::AddrInUse;
                last = Some(error);
            }
        }
    }
    let error = last.expect("a port is always tried at least once");
    // A port is one thing that can be wrong here, and it is the one worth a
    // sentence of its own. Anything else — no permission, no such address — is
    // a failure the log has more to say about than a message can.
    if !held {
        return Err(AppError::new("share.start.failed", error));
    }
    Err(AppError::new("share.port.in_use", error)
        .with_param("port", base)
        .with_param("count", tried))
}

/// One attempt at one port.
fn bind_one(port: u16) -> std::io::Result<std::net::TcpListener> {
    std::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, port)))
}

/// The handler for the protocol, over the filesystem built from the list.
fn dav_handler(files: ShareFs) -> DavHandler {
    DavHandler::builder()
        .filesystem(Box::new(files))
        // Finder and Explorer probe for locks before they will mount anything.
        // The placeholder answers those probes without keeping any lock: the
        // service is read-only, so there is nothing a lock could protect.
        .locksystem(FakeLs::new())
        .build_handler()
}

/// What every connection is served with: the handler for the protocol, the page
/// for the people, and the password both of them are behind.
#[derive(Clone)]
struct Endpoints {
    webdav: DavHandler,
    landing: String,
    credentials: Credentials,
    activity: Arc<Activity>,
}

/// Serves the port until the signal arrives, on a runtime and a thread of its
/// own.
fn serve(listener: std::net::TcpListener, ending: oneshot::Receiver<()>, endpoints: Endpoints) {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            tracing::error!(diagnostic = %error, "Failed to start the share service runtime");
            return;
        }
    };
    // Returns when the accept loop breaks, after which the runtime is dropped
    // here, on this thread and outside any asynchronous context.
    runtime.block_on(accept_loop(listener, ending, endpoints));
}

async fn accept_loop(
    listener: std::net::TcpListener,
    mut ending: oneshot::Receiver<()>,
    endpoints: Endpoints,
) {
    let listener = match tokio::net::TcpListener::from_std(listener) {
        Ok(listener) => listener,
        Err(error) => {
            tracing::error!(diagnostic = %error, "Failed to adopt the share listener");
            return;
        }
    };
    loop {
        tokio::select! {
            // Ending the service does not wait for a device to be polite: the
            // signal wins over a connection that is ready to be accepted.
            _ = &mut ending => break,
            accepted = listener.accept() => {
                let (stream, _) = match accepted {
                    Ok(pair) => pair,
                    Err(error) => {
                        // One connection that never arrived is not a reason to
                        // stop serving the ones that will.
                        tracing::debug!(diagnostic = %error, "Share connection refused");
                        continue;
                    }
                };
                let endpoints = endpoints.clone();
                // Who is asking is a property of the connection and not of the
                // request, which is why it is read here rather than in
                // `answer`: nothing in an HTTP request carries the sender's
                // address, and a header claiming one is the client's word.
                let caller = stream.peer_addr().ok().map(|peer| peer.ip());
                tokio::spawn(async move {
                    let service = service_fn(move |request| {
                        let endpoints = endpoints.clone();
                        async move { Ok::<_, Infallible>(answer(request, endpoints, caller).await) }
                    });
                    if let Err(error) = http1::Builder::new()
                        .serve_connection(TokioIo::new(stream), service)
                        .await
                    {
                        tracing::debug!(diagnostic = %error, "Share connection ended");
                    }
                });
            }
        }
    }
}

/// The one answer every request gets, from one of three places.
///
/// Who is asking comes first, and nothing is decided before it: what a request
/// is about is not something a caller without the password has any business
/// learning. Whether a name is on the list is answered by 200 and 404, and that
/// is a question about the user's library.
///
/// Past that, a browser at the root is a person checking whether the service is
/// up, and a client's PROPFIND on the same path is the protocol asking what is
/// here. They are the same request line and two different questions, and each is
/// answered by the half that understands it.
async fn answer(
    request: Request<Incoming>,
    endpoints: Endpoints,
    caller: Option<IpAddr>,
) -> Response<Body> {
    if !endpoints
        .credentials
        .accepts(request.headers().get(header::AUTHORIZATION))
    {
        return unauthorized();
    }
    // Recorded here and not at the door, so that what the page lists is the
    // devices the password let in. A connection made by something that never
    // gets that far is not a client of this library, and a scan of the network
    // would otherwise fill the list with addresses the user has never seen.
    if let Some(caller) = caller {
        endpoints
            .activity
            .saw(caller, request.headers().get(header::USER_AGENT));
    }
    if landing::wanted(&request) {
        return landing::response(&request, &endpoints.landing);
    }
    endpoints.webdav.handle(request).await
}

/// What a caller without the password is told.
///
/// The challenge is the whole of the answer: it names the scheme, and a client
/// that knows the scheme asks the user for a password, which is the only way in.
/// The body is empty because nothing reads it — a browser acts on the header and
/// shows its own box rather than the body, and a WebDAV client reports the
/// status and stops.
fn unauthorized() -> Response<Body> {
    Response::builder()
        .status(StatusCode::UNAUTHORIZED)
        .header(header::WWW_AUTHENTICATE, CHALLENGE)
        .body(Body::empty())
        .expect("A status and one header always build a response")
}
