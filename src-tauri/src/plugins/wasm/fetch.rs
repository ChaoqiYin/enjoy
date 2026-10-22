//! The `fetch` capability: the network, reached only through the kernel.
//!
//! A plugin never opens a socket. It asks the kernel for a URL, the kernel makes
//! the request, and what comes back is the HTTP status and the body — never the
//! headers, which a plugin has no use for and which are not the plugin's to
//! read. The request is a `GET` and nothing else (ADR 0043 §4): what a plugin
//! needs is a page or a file, and a capability that could also POST is a
//! capability that could do something to somebody's server.
//!
//! The caller chooses the headers, because a site that answers only a browser is
//! the ordinary case — a `User-Agent`, a `Referer`, a `Cookie` (spec #96 §5).
//! What the caller sends is what goes out; a request with no headers of its own
//! still carries this application's `User-Agent`, so the kernel is not
//! anonymous on a plugin's behalf.

use std::sync::OnceLock;

use wasmtime::Caller;

use super::imports::Guest;
use super::memory::{put, text};

/// How much of a response body `fetch` will read.
///
/// A plugin chooses the URL, so the server at the other end chooses how much it
/// can send, and a host that reads a body to the end is a host whose memory is
/// decided by somebody else's server. Eight mebibytes is more than any answer a
/// mount point wants — a cover, a JSON document, a page of HTML — and it is a
/// number this side controls. A body longer than this is cut off here, and the
/// length `fetch` answers with is the length of what it read, so a plugin that
/// gets exactly this many bytes knows it may be holding a prefix.
const FETCH_LIMIT: usize = 8 * 1024 * 1024;

/// One header the caller asked for.
#[derive(serde::Deserialize)]
struct Header {
    name: String,
    value: String,
}

/// How long a background instance's `fetch` may take.
///
/// Longer than a call's deadline on purpose: a site that takes seven seconds to
/// answer is an ordinary site, and the background's loop is not holding anyone's
/// screen while it waits (spec #96 §4). The bound is here rather than in the
/// client so that only the background gets it — a front's `fetch` is ended by
/// its own call's deadline, which is five seconds.
const BACKGROUND_FETCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

/// Fetches one URL, on the plugin's behalf, with the caller's headers.
pub(super) async fn fetch(
    caller: &mut Caller<'_, Guest>,
    url_at: i32,
    url_len: i32,
    headers_at: i32,
    headers_len: i32,
    out: i32,
    cap: i32,
) -> Result<i64, wasmtime::Error> {
    let url = text(caller, url_at, url_len)?;
    let headers = if headers_len <= 0 {
        // No headers of the caller's: the request goes out with the client's
        // own `User-Agent` and nothing else, which is today's behaviour.
        reqwest::header::HeaderMap::new()
    } else {
        let Some(headers) = headers(caller, headers_at, headers_len) else {
            return Ok(0);
        };
        headers
    };
    let Some(client) = client() else {
        return Ok(0);
    };
    let request = client.get(&url).headers(headers);
    let response = if caller.data().is_background() {
        match tokio::time::timeout(BACKGROUND_FETCH_TIMEOUT, request.send()).await {
            Ok(Ok(response)) => response,
            Ok(Err(error)) => {
                tracing::debug!(plugin = %caller.data().plugin(), %url, %error, "A plugin's fetch did not arrive");
                return Ok(0);
            }
            Err(_) => {
                tracing::debug!(plugin = %caller.data().plugin(), %url, "A plugin's fetch timed out");
                return Ok(0);
            }
        }
    } else {
        match request.send().await {
            Ok(response) => response,
            Err(error) => {
                tracing::debug!(plugin = %caller.data().plugin(), %url, %error, "A plugin's fetch did not arrive");
                return Ok(0);
            }
        }
    };
    let status = response.status().as_u16() as i64;
    let mut body = Vec::new();
    let mut response = response;
    while body.len() < FETCH_LIMIT {
        match response.chunk().await {
            Ok(Some(chunk)) => body.extend_from_slice(&chunk),
            Ok(None) => break,
            Err(error) => {
                tracing::debug!(plugin = %caller.data().plugin(), %url, %error, "A plugin's fetch was cut off");
                return Ok(0);
            }
        }
    }
    body.truncate(FETCH_LIMIT);
    put(caller, out, cap, &body)?;
    Ok((status << 32) | body.len() as i64)
}

/// The headers a plugin asked to send, or nothing when it sent something that
/// is not the list this capability accepts.
///
/// A caller that sends malformed headers gets status `0` — "the request did not
/// arrive" — because a request built out of a broken list is one the kernel will
/// not make, and the plugin has to treat it the same way: an answer it can fall
/// back from. What it must not do is send the request without the headers, which
/// would be a request the caller did not ask for.
fn headers(
    caller: &mut Caller<'_, Guest>,
    at: i32,
    len: i32,
) -> Option<reqwest::header::HeaderMap> {
    let json = text(caller, at, len).ok()?;
    let parsed: Vec<Header> = match serde_json::from_str(&json) {
        Ok(parsed) => parsed,
        Err(error) => {
            tracing::warn!(plugin = %caller.data().plugin(), %error, "A plugin's fetch headers were not a list");
            return None;
        }
    };
    let mut headers = reqwest::header::HeaderMap::new();
    for Header { name, value } in parsed {
        let name = match reqwest::header::HeaderName::try_from(name.as_str()) {
            Ok(name) => name,
            Err(error) => {
                tracing::warn!(plugin = %caller.data().plugin(), %error, "A plugin's fetch header name was not valid");
                return None;
            }
        };
        let value = match reqwest::header::HeaderValue::try_from(value.as_str()) {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!(plugin = %caller.data().plugin(), %error, "A plugin's fetch header value was not valid");
                return None;
            }
        };
        headers.append(name, value);
    }
    Some(headers)
}

/// The client `fetch` goes through, made once for the process.
///
/// Deliberately not the updater's client (`crate::update::download::client`):
/// that one carries a read timeout for a download that has stopped producing,
/// and a timeout here would be a second deadline nobody declared, arriving
/// before the one the runner sets and reported to the plugin as a request that
/// did not arrive. This one has no timeout of its own, so the only things that
/// end a slow fetch are the call's deadline and, in the background, the
/// twenty-second bound beside this module's `fetch`.
///
/// `None` when a client cannot be built at all, which is a fact about this
/// machine rather than about the plugin; it is logged once, at the point it is
/// first asked for, and every fetch answers status 0 from then on.
fn client() -> Option<&'static reqwest::Client> {
    static CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            // Installed here rather than borrowed from whatever else may have
            // done it, for the reason the updater's client gives: this client
            // needs a TLS backend, and an implicit install elsewhere would make
            // a plugin's fetch depend on an update check having run first.
            if rustls::crypto::CryptoProvider::get_default().is_none() {
                let _ = rustls::crypto::ring::default_provider().install_default();
            }
            match reqwest::Client::builder()
                .user_agent(concat!("Enjoy/", env!("CARGO_PKG_VERSION")))
                .build()
            {
                Ok(client) => Some(client),
                Err(error) => {
                    tracing::error!(%error, "A plugin's fetch has no HTTP client");
                    None
                }
            }
        })
        .as_ref()
}
