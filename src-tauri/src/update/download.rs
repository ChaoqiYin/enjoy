use std::time::Duration;

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_RANGE, RANGE};
use reqwest::{Client, Response, StatusCode, Url};

use super::control::{Stop, StopFlag};

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

/// The two asks a transfer can be given. `Stop::Run` is not one of them: it is
/// the absence of an ask, so a transfer that ended by being stopped always has
/// one of these to report rather than a value the caller has to re-check.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(super) enum Asked {
    Pause,
    Cancel,
}

/// How a transfer ended. Every way out of the loop is one of these, and the
/// ones that carry bytes carry them so the caller decides what they mean: the
/// loop knows how far it got, not whether that distance is worth keeping.
pub(super) enum Transfer {
    /// The payload is whole. A payload resumed from earlier bytes is whole in
    /// the same sense, and the caller cannot tell the difference — which is the
    /// point.
    Complete(Vec<u8>),
    /// The user asked for it to stop.
    Stopped {
        asked: Asked,
        bytes: Vec<u8>,
        total: Option<u64>,
    },
    /// The connections ran out. No length is handed back with it: a failed
    /// transfer shows a failure, and the next one announces the length again.
    Failed { error: FetchError, bytes: Vec<u8> },
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

/// Fetches the payload, resuming across as many connections as it takes, and
/// stopping when the user asks it to.
///
/// The updater plugin reads its response in one pass and drops what it had when
/// the connection ends early, so on a link that drops every few seconds a
/// release of any size can never arrive — which is the state this replaces. The
/// bytes are kept and the rest is asked for with a range, so a transfer that
/// dies at 700 KiB has lost 700 KiB of waiting and nothing else.
///
/// `from` is what an earlier transfer arrived at, so continuing one is the same
/// call as starting one. The stop is checked between connections as well as
/// during them: a pause asked for while the last connection was closing would
/// otherwise be answered by opening another one.
pub(super) async fn fetch(
    client: &Client,
    url: &Url,
    from: Vec<u8>,
    stop: &StopFlag,
    mut on_progress: impl FnMut(u64, Option<u64>),
) -> Transfer {
    let mut buffer = from;
    let mut total: Option<u64> = None;
    let mut attempts = 0u32;
    let mut barren = 0u32;
    loop {
        if let Some(asked) = asked(stop.requested()) {
            return Transfer::Stopped {
                asked,
                bytes: buffer,
                total,
            };
        }
        attempts += 1;
        let before = buffer.len() as u64;
        match attempt(client, url, &mut buffer, &mut total, &mut on_progress, stop).await {
            Attempt::Stopped(asked) => {
                return Transfer::Stopped {
                    asked,
                    bytes: buffer,
                    total,
                }
            }
            Attempt::Ended(Ok(())) if whole(&buffer, total) => return Transfer::Complete(buffer),
            // A clean end short of the announced length is still a short
            // payload: something closed the connection without saying so.
            Attempt::Ended(Ok(())) => barren += 1,
            Attempt::Ended(Err(FetchError::Restart)) => {
                // Bytes went backwards, which is worse than bringing none, so
                // this counts as one of the connections that got nowhere. A
                // server that keeps answering with a range that does not
                // continue the download therefore ends the attempt rather than
                // being asked again and again.
                barren += 1;
            }
            Attempt::Ended(Err(error)) => {
                tracing::debug!(%error, attempts, "Update download attempt failed");
                barren = if buffer.len() as u64 == before {
                    barren + 1
                } else {
                    0
                };
            }
        }
        match next_attempt(attempts, barren) {
            Some(wait) => wait_out(wait, stop).await,
            None => {
                return Transfer::Failed {
                    error: FetchError::Exhausted(attempts),
                    bytes: buffer,
                }
            }
        }
    }
}

/// The ask a stop value stands for, when it stands for one.
fn asked(stop: Stop) -> Option<Asked> {
    match stop {
        Stop::Run => None,
        Stop::Pause => Some(Asked::Pause),
        Stop::Cancel => Some(Asked::Cancel),
    }
}

/// Whether the payload is complete. An announced length is the finish line;
/// without one the stream ending is the only end there is, so it counts.
fn whole(buffer: &[u8], total: Option<u64>) -> bool {
    total.is_none_or(|total| buffer.len() as u64 >= total)
}

/// Waits out the backoff, or ends the wait as soon as the user asks to stop.
///
/// The wait is dead time by definition — the last connection brought nothing —
/// so a pause that sat through it would look like a button that did not work.
async fn wait_out(wait: Duration, stop: &StopFlag) {
    tokio::select! {
        _ = tokio::time::sleep(wait) => {}
        _ = stop.changed() => {}
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

/// How one connection ended.
enum Attempt {
    /// It ended on its own, cleanly or otherwise.
    Ended(Result<(), FetchError>),
    /// The user asked for the transfer to stop, and the read let go.
    Stopped(Asked),
}

/// One connection: ask for what is missing, keep what arrives.
async fn attempt(
    client: &Client,
    url: &Url,
    buffer: &mut Vec<u8>,
    total: &mut Option<u64>,
    on_progress: &mut impl FnMut(u64, Option<u64>),
    stop: &StopFlag,
) -> Attempt {
    let have = buffer.len() as u64;
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/octet-stream"));
    if have > 0 {
        let range = HeaderValue::from_str(&format!("bytes={have}-"))
            .expect("a byte range is always a valid header value");
        headers.insert(RANGE, range);
    }
    let response = match client.get(url.clone()).headers(headers).send().await {
        Ok(response) => response,
        Err(error) => return Attempt::Ended(Err(FetchError::Transport(error.to_string()))),
    };

    match response.status() {
        StatusCode::PARTIAL_CONTENT => {
            // Resuming. Where the answer starts has to be where this buffer
            // ends, or the two halves are not the same file.
            match content_range(&response).filter(|(start, _)| *start == have) {
                Some((_, length)) => *total = Some(length),
                None => {
                    buffer.clear();
                    return Attempt::Ended(Err(FetchError::Restart));
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
            return Attempt::Ended(Err(FetchError::Restart));
        }
        status => return Attempt::Ended(Err(FetchError::Status(status.as_u16()))),
    }

    let mut stream = response.bytes_stream();
    loop {
        // Reading is where a download spends nearly all of its time, so this is
        // where a stop has to be felt. Dropping the pending `next` loses
        // nothing: the connection and what it has read belong to the stream,
        // which is dropped with it.
        //
        // A wake that turns out not to be an ask — a notification left over
        // from a request already answered — goes back to reading rather than
        // ending a transfer nobody asked to end.
        let chunk = tokio::select! {
            chunk = stream.next() => chunk,
            _ = stop.changed() => match asked(stop.requested()) {
                Some(asked) => return Attempt::Stopped(asked),
                None => continue,
            },
        };
        let Some(chunk) = chunk else {
            return Attempt::Ended(Ok(()));
        };
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(error) => return Attempt::Ended(Err(FetchError::Transport(error.to_string()))),
        };
        buffer.extend_from_slice(&chunk);
        on_progress(buffer.len() as u64, *total);
    }
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
