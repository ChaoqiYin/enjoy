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
use std::net::{Ipv4Addr, SocketAddr};

use dav_server::fakels::FakeLs;
use dav_server::{body::Body, DavHandler};
use http::{Request, Response};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::rt::TokioIo;
use tokio::sync::oneshot;

use crate::error::AppError;

use super::fs::ShareFs;
use super::landing;

/// The port a WebDAV service is registered on, and the one this application
/// asks for first. Which port was actually taken is a separate fact, and the one
/// the interface shows.
pub(crate) const DEFAULT_PORT: u16 = 4918;

/// A service listening on a port, until it is ended.
pub(crate) struct Service {
    port: u16,
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
    /// collide on a port neither owns; the interface always names one.
    pub(crate) fn start(requested: Option<u16>, language: &str) -> Result<Self, AppError> {
        let listener = bind(requested)?;
        let port = listener
            .local_addr()
            .map_err(|error| AppError::new("share.start.failed", error))?
            .port();
        listener
            .set_nonblocking(true)
            .map_err(|error| AppError::new("share.start.failed", error))?;
        let endpoints = Endpoints {
            webdav: dav_handler(),
            landing: landing::page(language),
        };
        let (ending, signal) = oneshot::channel();
        let thread = std::thread::spawn(move || serve(listener, signal, endpoints));
        Ok(Self {
            port,
            ending,
            thread,
        })
    }

    /// The port the service actually took, which is not always the one asked
    /// for: `None` asks for the system's own choice.
    pub(crate) fn port(&self) -> u16 {
        self.port
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
fn bind(requested: Option<u16>) -> Result<std::net::TcpListener, AppError> {
    let address = SocketAddr::from((Ipv4Addr::UNSPECIFIED, requested.unwrap_or(0)));
    std::net::TcpListener::bind(address).map_err(|error| match requested {
        // A port the user is told about, and the only thing that can be wrong
        // with it: something else already has it.
        Some(port) if error.kind() == std::io::ErrorKind::AddrInUse => {
            AppError::new("share.port.in_use", error).with_param("port", port)
        }
        _ => AppError::new("share.start.failed", error),
    })
}

/// The handler for the protocol, over the filesystem built from the list.
fn dav_handler() -> DavHandler {
    DavHandler::builder()
        .filesystem(Box::new(ShareFs))
        // Finder and Explorer probe for locks before they will mount anything.
        // The placeholder answers those probes without keeping any lock: the
        // service is read-only, so there is nothing a lock could protect.
        .locksystem(FakeLs::new())
        .build_handler()
}

/// What every connection is served with: the handler for the protocol, and the
/// page for the people.
#[derive(Clone)]
struct Endpoints {
    webdav: DavHandler,
    landing: String,
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
                tokio::spawn(async move {
                    let service = service_fn(move |request| {
                        let endpoints = endpoints.clone();
                        async move { Ok::<_, Infallible>(answer(request, endpoints).await) }
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

/// The one answer every request gets, from one of two places.
///
/// A browser at the root is a person checking whether the service is up; a
/// client's PROPFIND on the same path is the protocol asking what is here. They
/// are the same request line and two different questions, and each is answered
/// by the half that understands it.
async fn answer(request: Request<Incoming>, endpoints: Endpoints) -> Response<Body> {
    if landing::wanted(&request) {
        return landing::response(&request, &endpoints.landing);
    }
    endpoints.webdav.handle(request).await
}
