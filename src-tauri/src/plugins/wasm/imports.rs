//! What a body is handed besides the calls themselves.
//!
//! A WebAssembly module has no environment: everything it can do is something
//! the host defined for it by name (ADR 0044 §1). This module is that list, and
//! the list is short on purpose — a plugin's working half is granted four
//! things and nothing else (ADR 0043 §4):
//!
//! - **a URL is fetched** — the network, reached only through the kernel;
//! - **its own data directory** is read and written — one directory per plugin,
//!   global rather than per space, and nothing outside it;
//! - **a line is logged** — where the user can hand it over when something goes
//!   wrong;
//! - **the call's context is read** — the params the kernel forwarded, which is
//!   where the video is for a video-scoped mount point.
//!
//! What is *not* here is as much of the design as what is: no file system
//! outside that one directory, no database, no kernel command, no listening
//! socket (ADR 0043 §4). And no way to write to the library at all — a plugin
//! returns data and the kernel writes it, which is the only path into the
//! database a plugin has.
//!
//! # The calls, exactly
//!
//! Every import is defined under the module name `"enjoy"`. None of them takes
//! or returns a string: wasm has no such type, so text and bytes are passed
//! through the guest's own linear memory as a pointer and a length, and every
//! buffer the host writes into is one the guest handed over — the host never
//! allocates in the guest's memory, so there is only ever one allocator with an
//! opinion about what is free.
//!
//! | import | answers |
//! | --- | --- |
//! | `fetch(url, url_len, out, cap) -> i64` | `(status << 32) \| len`: the HTTP status and the body's length, of which `min(len, cap)` bytes are written to `out`. `0` is not a status a server sent — it is "the request did not arrive". |
//! | `storage_read(name, name_len, out, cap) -> i32` | the file's length, of which `min(len, cap)` bytes are written; `-1` if there is no such file. |
//! | `storage_write(name, name_len, data, data_len) -> i32` | `0`, or `-1` if the name is not one this plugin may write. |
//! | `log(level, msg, msg_len)` | nothing. `0` is an error, `1` a warning, `2` info, `3` debug; anything else is info. |
//! | `video_info(out, cap) -> i32` | the params of the call in flight, verbatim — see below. |
//!
//! The four capability names above are five functions because storage is two:
//! reading and writing are separately grantable things, and a plugin that only
//! reads should not be handed the other.
//!
//! # What a plugin is told about the call
//!
//! `video_info` hands back the params the kernel forwarded, unchanged. That is
//! the whole of the plugin's context, and it is deliberately not a summary the
//! kernel writes: params are the *complete* context (spec #82), so a
//! `video.fields` call carries the space, the video and the values the chain
//! already has, and a call that is not about one video carries the space it is
//! in rather than an empty object. What a body needs to answer is in there, and
//! the kernel does not add a second channel to say it again.
//!
//! # The two places a plugin's data can go
//!
//! `storage` writes in the plugin's own directory and nowhere else. The name it
//! is given is one file name: no separators, no `..`, nothing absolute. That is
//! narrower than the file system allows, and it is the whole of the confinement
//! — there is no path to check for escape because a path is not a thing this
//! capability accepts. A plugin that wants a tree is a plugin that has not been
//! designed for yet.
//!
//! The log is the other, and it is the same `tracing` the kernel writes to
//! (`crate::logging`): the file the user is asked for when something goes
//! wrong. Every line carries the plugin's name, so a user reading the file can
//! tell whose it is.

use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

use wasmtime::{Caller, Engine, Linker, Memory, StoreLimits, StoreLimitsBuilder};

use super::MEMORY_LIMIT;

/// The module every import of a body is defined under.
///
/// One name for the four, so that a module's import list reads as one list of
/// what it was granted, and so that a fifth capability is a line someone writes
/// here rather than something a plugin can find on its own (ADR 0044 §1).
const MODULE: &str = "enjoy";

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

/// The kernel's side of one plugin's instance: everything the four imports need
/// to reach, and the limits the store holds it to.
pub(super) struct Guest {
    /// Enforced by wasmtime through [`wasmtime::Store::limiter`], which reads
    /// it out of here on every memory growth.
    pub(super) limits: StoreLimits,
    /// The one directory the `storage` capability can reach.
    data_dir: PathBuf,
    /// Whose instance this is, so that a line the plugin logs can say so.
    plugin: String,
    /// The params of the call in flight, which is what `video_info` answers
    /// with.
    ///
    /// Set before every call and left standing between them, rather than
    /// cleared when one ends: a plugin's own code runs only inside `handle`,
    /// which is after the host has set this, so there is no moment at which a
    /// plugin can read one call's params during another. What it holds between
    /// calls is therefore nobody's answer — and it starts empty, which is what
    /// a start function reading it before the first call gets.
    context: String,
}

impl Guest {
    pub(super) fn new(plugin: &str, data_dir: PathBuf) -> Self {
        Self {
            limits: StoreLimitsBuilder::new().memory_size(MEMORY_LIMIT).build(),
            data_dir,
            plugin: plugin.to_string(),
            context: String::new(),
        }
    }

    /// Tells the instance what the call it is about to be given is about.
    ///
    /// Set before the call rather than passed into it: `handle` takes two
    /// strings and the ABI has no third place to put them, and a plugin
    /// reaching for its context is reaching for something the host already has.
    pub(super) fn about_to_call(&mut self, params: &str) {
        self.context.clear();
        self.context.push_str(params);
    }
}

/// The imports one body's instance is linked against.
///
/// Every one of them is async, which is what makes a plugin waiting on the
/// network a wait that can be cut off (ADR 0044 §5). Async is a one-way door —
/// the store is an async store from the first of these — so the ones that never
/// await are async too rather than being a second kind of import.
pub(super) fn linker(engine: &Engine) -> Result<Linker<Guest>, String> {
    let mut linker = Linker::new(engine);
    linker
        .func_wrap_async(
            MODULE,
            "fetch",
            |mut caller: Caller<'_, Guest>, (url, url_len, out, cap): (i32, i32, i32, i32)| {
                Box::new(async move { fetch(&mut caller, url, url_len, out, cap).await })
            },
        )
        .map_err(|error| format!("the `fetch` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "storage_read",
            |mut caller: Caller<'_, Guest>, (name, name_len, out, cap): (i32, i32, i32, i32)| {
                Box::new(async move { storage_read(&mut caller, name, name_len, out, cap) })
            },
        )
        .map_err(|error| format!("the `storage_read` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "storage_write",
            |mut caller: Caller<'_, Guest>, (name, name_len, at, len): (i32, i32, i32, i32)| {
                Box::new(async move { storage_write(&mut caller, name, name_len, at, len) })
            },
        )
        .map_err(|error| format!("the `storage_write` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "log",
            |mut caller: Caller<'_, Guest>, (level, msg, msg_len): (i32, i32, i32)| {
                Box::new(async move { log(&mut caller, level, msg, msg_len) })
            },
        )
        .map_err(|error| format!("the `log` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "video_info",
            |mut caller: Caller<'_, Guest>, (out, cap): (i32, i32)| {
                Box::new(async move { video_info(&mut caller, out, cap) })
            },
        )
        .map_err(|error| format!("the `video_info` import could not be defined: {error}"))?;
    Ok(linker)
}

/// Fetches one URL, on the plugin's behalf.
///
/// A request that did not arrive is answered as status `0` rather than as a
/// trap: which of "the site is down", "the name does not resolve" and "this
/// machine is offline" it was is not something the plugin can do anything
/// different about, and a trap would take the whole call away from a plugin
/// that would rather fall back. What it cannot do is mistake it for an answer —
/// no server sends status 0.
async fn fetch(
    caller: &mut Caller<'_, Guest>,
    url_at: i32,
    url_len: i32,
    out: i32,
    cap: i32,
) -> Result<i64, wasmtime::Error> {
    let url = text(caller, url_at, url_len)?;
    let Some(client) = client() else {
        return Ok(0);
    };
    let response = match client.get(&url).send().await {
        Ok(response) => response,
        Err(error) => {
            tracing::debug!(plugin = %caller.data().plugin, %url, %error, "A plugin's fetch did not arrive");
            return Ok(0);
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
                tracing::debug!(plugin = %caller.data().plugin, %url, %error, "A plugin's fetch was cut off");
                return Ok(0);
            }
        }
    }
    body.truncate(FETCH_LIMIT);
    put(caller, out, cap, &body)?;
    Ok((status << 32) | body.len() as i64)
}

/// Reads one file out of the plugin's own directory.
fn storage_read(
    caller: &mut Caller<'_, Guest>,
    name_at: i32,
    name_len: i32,
    out: i32,
    cap: i32,
) -> Result<i32, wasmtime::Error> {
    let name = text(caller, name_at, name_len)?;
    let Some(path) = inside(&caller.data().data_dir, &name) else {
        return Ok(-1);
    };
    match std::fs::read(&path) {
        Ok(bytes) => {
            put(caller, out, cap, &bytes)?;
            Ok(bytes.len() as i32)
        }
        Err(error) => {
            // A file that is not there is an ordinary answer — a plugin asking
            // whether it has fetched something before — and is not worth a line
            // in the log. Anything else is the machine's, and is.
            if error.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!(plugin = %caller.data().plugin, path = %path.display(), %error, "A plugin's file could not be read");
            }
            Ok(-1)
        }
    }
}

/// Writes one file into the plugin's own directory.
fn storage_write(
    caller: &mut Caller<'_, Guest>,
    name_at: i32,
    name_len: i32,
    at: i32,
    len: i32,
) -> Result<i32, wasmtime::Error> {
    let name = text(caller, name_at, name_len)?;
    let bytes = bytes(caller, at, len)?;
    let Some(path) = inside(&caller.data().data_dir, &name) else {
        return Ok(-1);
    };
    match std::fs::write(&path, &bytes) {
        Ok(()) => Ok(0),
        Err(error) => {
            tracing::warn!(plugin = %caller.data().plugin, path = %path.display(), %error, "A plugin's file could not be written");
            Ok(-1)
        }
    }
}

/// Writes one line to the log the kernel writes to.
fn log(
    caller: &mut Caller<'_, Guest>,
    level: i32,
    msg_at: i32,
    msg_len: i32,
) -> Result<(), wasmtime::Error> {
    let message = text(caller, msg_at, msg_len)?;
    let plugin = caller.data().plugin.as_str();
    // The plugin's own words, with the plugin's name beside them: the file is
    // read by someone trying to work out which plugin is misbehaving, and a
    // line that does not say is a line they have to guess about.
    match level {
        0 => tracing::error!(plugin, "{message}"),
        1 => tracing::warn!(plugin, "{message}"),
        3 => tracing::debug!(plugin, "{message}"),
        _ => tracing::info!(plugin, "{message}"),
    }
    Ok(())
}

/// Hands back the params of the call in flight.
fn video_info(caller: &mut Caller<'_, Guest>, out: i32, cap: i32) -> Result<i32, wasmtime::Error> {
    let context = caller.data().context.clone();
    put(caller, out, cap, context.as_bytes())?;
    Ok(context.len() as i32)
}

/// The client `fetch` goes through, made once for the process.
///
/// Deliberately not the updater's client (`crate::update::download::client`):
/// that one carries a read timeout for a download that has stopped producing,
/// and a timeout here would be a second deadline nobody declared, arriving
/// before the one the runner sets and reported to the plugin as a request that
/// did not arrive. This one has no timeout of its own, so the only thing that
/// ends a slow fetch is the call's deadline.
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

/// The file a name refers to, if it is one this plugin may touch.
///
/// One component and one only: a plugin's directory holds files, and a name
/// with a separator in it, or `..`, or a root, is not a file in that directory.
/// Returning `None` rather than an error is the shape of the capability — there
/// is no such file, and there is nothing for a plugin to learn from being told
/// which part of the name was refused.
fn inside(directory: &Path, name: &str) -> Option<PathBuf> {
    let mut parts = Path::new(name).components();
    match (parts.next(), parts.next()) {
        (Some(Component::Normal(one)), None) => Some(directory.join(one)),
        _ => None,
    }
}

/// The instance's memory, as this side of a call sees it.
fn memory(caller: &mut Caller<'_, Guest>) -> Result<Memory, wasmtime::Error> {
    caller
        .get_export("memory")
        .and_then(|export| export.into_memory())
        .ok_or_else(|| wasmtime::Error::msg("the plugin's module exports no memory"))
}

/// The bytes the guest left at `at`, for `len`.
///
/// `len` is the guest's number and is held to what the guest has before
/// anything is allocated for it. Left alone it is an `i32` and can name two
/// gibibytes, and `MEMORY_LIMIT` does not stand in its way: the limiter holds
/// the *instance's* memory to sixteen mebibytes, while an allocation made here
/// is the kernel's own and is made before the read below could refuse it. A
/// plugin's oversized claim has to cost the plugin, not the process it runs in.
fn bytes(caller: &mut Caller<'_, Guest>, at: i32, len: i32) -> Result<Vec<u8>, wasmtime::Error> {
    let memory = memory(caller)?;
    let len = (len.max(0) as usize).min(memory.data_size(&*caller));
    let mut bytes = vec![0u8; len];
    memory
        .read(&*caller, at.max(0) as usize, &mut bytes)
        .map_err(|error| {
            wasmtime::Error::msg(format!("a plugin's bytes were out of reach: {error}"))
        })?;
    Ok(bytes)
}

/// The same, as text.
fn text(caller: &mut Caller<'_, Guest>, at: i32, len: i32) -> Result<String, wasmtime::Error> {
    let bytes = bytes(caller, at, len)?;
    String::from_utf8(bytes)
        .map_err(|error| wasmtime::Error::msg(format!("a plugin sent text that was not: {error}")))
}

/// Writes as much of `bytes` as fits in the guest's buffer, and no more.
///
/// The buffer is the guest's: `cap` is how much it allocated, and a host that
/// wrote past it would be writing over whatever the guest keeps next door. What
/// does not fit is not written, and every caller answers with the length the
/// value really has, so a guest that was given less than it asked for can see
/// that it was.
fn put(
    caller: &mut Caller<'_, Guest>,
    at: i32,
    cap: i32,
    bytes: &[u8],
) -> Result<(), wasmtime::Error> {
    let memory = memory(caller)?;
    let room = (cap.max(0) as usize).min(bytes.len());
    memory
        .write(&mut *caller, at.max(0) as usize, &bytes[..room])
        .map_err(|error| {
            wasmtime::Error::msg(format!("a plugin's buffer was out of reach: {error}"))
        })
}
