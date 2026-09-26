use std::time::Duration;

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_RANGE, RANGE};
use reqwest::{Client, Response, StatusCode, Url};

/// A connection that has produced nothing for this long is treated as dead.
///
/// Without this a half-open socket — the shape a dropped transfer often takes —
/// would leave the download waiting instead of opening another connection, and
/// the failure would be a hang rather than a retry.
const STALL_TIMEOUT: Duration = Duration::from_secs(20);

/// The wait before another connection is tried, and the ceiling that wait grows
/// to. Short, because a dropped connection here is not a refusal: the bytes are
/// still there to be fetched, and every second spent waiting is a second not
/// spent transferring. The ceiling is what keeps a server that is refusing from
/// being asked ever less often for no gain.
pub(super) const FIRST_BACKOFF: Duration = Duration::from_millis(250);
pub(super) const MAX_BACKOFF: Duration = Duration::from_secs(2);

/// How many connections in a row may add nothing before the endpoint is taken
/// as gone rather than flaky. Four waits, and the ceiling is reached on the
/// last of them: a longer run of failures than this is not a link that is
/// dropping connections, it is one that has stopped answering.
const MAX_BARREN_ATTEMPTS: u32 = 5;

/// A ceiling on connections, so a server handing over a few bytes at a time
/// still ends in a report rather than in a loop with no end. Generous on
/// purpose: at a few hundred kilobytes per connection — which is what a link
/// that drops every ten seconds gives — a release of this size needs a couple
/// of hundred of them, and stopping short of that would fail the very case
/// this loop exists for.
const MAX_ATTEMPTS: u32 = 1000;

/// Why the payload could not be assembled.
#[derive(Debug)]
pub(super) enum FetchError {
    /// The connection itself failed: reset, refused, TLS, or closed partway
    /// through the payload.
    Transport(String),
    /// The server answered with something that is not a payload.
    Status(u16),
    /// An answer that does not continue what is already held — a range that
    /// starts somewhere else, or one past the end. What was held is dropped.
    Restart,
    /// The connections ran out: a run of them brought nothing, or there were
    /// too many of them to keep trying.
    Exhausted(u32),
}

impl std::fmt::Display for FetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Transport(reason) => write!(f, "the connection ended early: {reason}"),
            Self::Status(status) => write!(f, "the download answered with status {status}"),
            Self::Restart => write!(f, "the server sent a range that does not continue it"),
            Self::Exhausted(attempts) => write!(f, "gave up after {attempts} connections"),
        }
    }
}

/// The client every attempt goes through.
///
/// Two settings are deliberate. There is a read timeout but no total one: a
/// release is tens of megabytes over whatever link the user has, so a deadline
/// that fits a fast connection is a deadline that fails a slow one, while a
/// connection that stops producing is what the retry loop is for. And the proxy
/// is left at the default, which on Windows reads the system settings — the
/// same answer the check gets, so a user behind a proxy does not find one half
/// of this feature proxied and the other half not.
pub(super) fn client(user_agent: &str) -> reqwest::Result<Client> {
    // Installed here rather than borrowed from whatever else may have done it:
    // this client needs a TLS backend of its own, and an implicit install
    // elsewhere would make a download depend on a check having run first.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    Client::builder()
        .user_agent(user_agent)
        .read_timeout(STALL_TIMEOUT)
        .build()
}

/// Fetches the payload, resuming across as many connections as it takes.
///
/// The updater plugin reads its response in one pass and drops what it had when
/// the connection ends early, so on a link that drops every few seconds a
/// release of any size can never arrive — which is the state this replaces. The
/// bytes are kept and the rest is asked for with a range, so a transfer that
/// dies at 700 KiB has lost 700 KiB of waiting and nothing else.
pub(super) async fn fetch(
    client: &Client,
    url: &Url,
    mut on_progress: impl FnMut(u64, Option<u64>),
) -> Result<Vec<u8>, FetchError> {
    let mut buffer: Vec<u8> = Vec::new();
    let mut total: Option<u64> = None;
    let mut attempts = 0u32;
    let mut barren = 0u32;
    loop {
        attempts += 1;
        let before = buffer.len() as u64;
        let outcome = attempt(client, url, &mut buffer, &mut total, &mut on_progress).await;
        match outcome {
            // An announced length is the finish line. Without one the stream
            // ending is the only end there is, so it counts as one.
            Ok(()) if total.is_none_or(|total| buffer.len() as u64 >= total) => return Ok(buffer),
            // A clean end short of the announced length is still a short
            // payload: something closed the connection without saying so.
            Ok(()) => barren += 1,
            Err(FetchError::Restart) => {
                // Nothing about the transfer survived, so the run of empty
                // connections starts over with it.
                barren = 0;
            }
            Err(error) => {
                tracing::debug!(%error, attempts, "Update download attempt failed");
                barren = if buffer.len() as u64 == before {
                    barren + 1
                } else {
                    0
                };
            }
        }
        match next_attempt(attempts, barren) {
            Some(wait) => tokio::time::sleep(wait).await,
            None => return Err(FetchError::Exhausted(attempts)),
        }
    }
}

/// Whether another connection is worth opening, and how long to wait first.
///
/// Progress buys attempts, not the count of them: a link that drops every few
/// seconds still converges as long as each connection brings bytes, and it is a
/// run of connections bringing nothing that says the server has stopped
/// answering. The wait grows with that run and stays short while bytes arrive.
pub(super) fn next_attempt(attempts: u32, barren: u32) -> Option<Duration> {
    if barren >= MAX_BARREN_ATTEMPTS || attempts >= MAX_ATTEMPTS {
        return None;
    }
    let factor = 1u32 << barren.min(6);
    Some((FIRST_BACKOFF * factor).min(MAX_BACKOFF))
}

/// One connection: ask for what is missing, keep what arrives.
async fn attempt(
    client: &Client,
    url: &Url,
    buffer: &mut Vec<u8>,
    total: &mut Option<u64>,
    on_progress: &mut impl FnMut(u64, Option<u64>),
) -> Result<(), FetchError> {
    let have = buffer.len() as u64;
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/octet-stream"));
    if have > 0 {
        let range = HeaderValue::from_str(&format!("bytes={have}-"))
            .expect("a byte range is always a valid header value");
        headers.insert(RANGE, range);
    }
    let response = client
        .get(url.clone())
        .headers(headers)
        .send()
        .await
        .map_err(|error| FetchError::Transport(error.to_string()))?;

    match response.status() {
        StatusCode::PARTIAL_CONTENT => {
            // Resuming. Where the answer starts has to be where this buffer
            // ends, or the two halves are not the same file.
            match content_range(&response).filter(|(start, _)| *start == have) {
                Some((_, length)) => *total = Some(length),
                None => {
                    buffer.clear();
                    return Err(FetchError::Restart);
                }
            }
        }
        StatusCode::OK => {
            // The server ignored the range and is sending the whole thing
            // again, so what is held is about to be replaced by it.
            buffer.clear();
            if let Some(length) = content_length(&response) {
                *total = Some(length);
            }
        }
        StatusCode::RANGE_NOT_SATISFIABLE if have > 0 => {
            // Past the end of what the server has, so what is held is not this
            // file at all. Start over rather than trust it.
            buffer.clear();
            return Err(FetchError::Restart);
        }
        status => return Err(FetchError::Status(status.as_u16())),
    }

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| FetchError::Transport(error.to_string()))?;
        buffer.extend_from_slice(&chunk);
        on_progress(buffer.len() as u64, *total);
    }
    Ok(())
}

fn content_length(response: &Response) -> Option<u64> {
    response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)?
        .to_str()
        .ok()?
        .parse()
        .ok()
}

/// The start and the total from a `Content-Range`, when it states both.
///
/// `bytes 700-999/1000` is the shape. A total of `*` — the server declining to
/// say how long the file is — states no finish line, so it is not one.
fn content_range(response: &Response) -> Option<(u64, u64)> {
    let value = response.headers().get(CONTENT_RANGE)?.to_str().ok()?;
    let (range, total) = value.trim().strip_prefix("bytes ")?.split_once('/')?;
    let start = range.split_once('-')?.0.parse().ok()?;
    let total = total.trim().parse().ok()?;
    Some((start, total))
}
