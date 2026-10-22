//! The imports one body's instance is linked against: the whole of what a
//! plugin may reach.
//!
//! A wasm module has no ambient anything, so what a plugin can do is exactly
//! the list of names the kernel defines for it (ADR 0044 §1). This module is
//! that list, and it is deliberately short — a plugin's working half is granted
//! a handful of things and nothing else:
//!
//! - **a URL is fetched** — the network, reached only through the kernel, with
//!   the headers the caller chooses ([`super::fetch`]);
//! - **its own data directory** is read and written — one directory per plugin,
//!   global rather than per space, and nothing outside it ([`super::storage`]);
//! - **the task queue** — asking for work, waiting for it, reporting on it, and
//!   saying how it ended, always and only about the plugin's own tasks
//!   ([`super::tasks`]);
//! - **a line is logged** — where the user can hand it over when something goes
//!   wrong;
//! - **the clock is read** — the wall clock in milliseconds, so a plugin can say
//!   when something happened rather than only when it was told to;
//! - **the call's context is read** — the params the kernel forwarded, which is
//!   where the video is for a video-scoped mount point.
//!
//! What is *not* here is as much of the design as what is: no file system
//! outside that one directory, no listening socket, no kernel command (ADR 0043
//! §4). The task queue is the one thing that looks like a hole in "no database",
//! and it is not one — the plugin never sees a table, a row it does not own or a
//! query, only the four verbs below, and every one of them is answered for the
//! plugin's own id alone (spec #96 §3). What a plugin still cannot do is write
//! to the library at all: it returns data and the kernel writes it, which is the
//! only path into the library a plugin has.
//!
//! # The calls, exactly
//!
//! Every import is defined under the module name [`MODULE`]. None of them takes
//! or returns a string: wasm has no such type, so text and bytes are passed
//! through the guest's own linear memory as a pointer and a length, and every
//! buffer the host writes into is one the guest handed over — the host never
//! allocates in the guest's memory, so there is only ever one allocator with an
//! opinion about what is free (see [`super::memory`]).
//!
//! The five capabilities that are one call each, plus the queue's six:
//!
//! | import | answers |
//! | --- | --- |
//! | `fetch(url, url_len, headers, headers_len, out, cap) -> i64` | `(status << 32) \| len`: the HTTP status and the body's length, of which `min(len, cap)` bytes are written to `out`. `0` is not a status a server sent — it is "the request did not arrive" (or the header list was not one this capability accepts). |
//! | `storage_read(name, name_len, out, cap) -> i32` | the file's length, of which `min(len, cap)` bytes are written; `-1` if there is no such file. |
//! | `storage_write(name, name_len, data, data_len) -> i32` | `0`, or `-1` if the name is not one this plugin may write. |
//! | `log(level, msg, msg_len)` | nothing. `0` is an error, `1` a warning, `2` info, `3` debug; anything else is info. |
//! | `video_info(out, cap) -> i32` | the params of the call in flight, verbatim — see below. |
//! | `task_push(kind, kind_len, space_id, video_id, payload, payload_len) -> id` | the queued task's id, or the id of the same work already queued; negative on refusal. |
//! | `task_wait(timeout_ms, out, cap) -> len` | the claimed task as JSON and its length, `0` if nothing came, `-1` if the plugin is being stopped. |
//! | `task_progress(id, current, total, label, label_len) -> i32` | `0`, or negative if the task is not the plugin's. |
//! | `task_checkpoint(id) -> i32` | `0` run, `1` pause, `2` cancel, negative if the task is not the plugin's. |
//! | `task_done(id, fields, fields_len) -> i32` | `0`, or negative if the task is not the plugin's. |
//! | `task_fail(id, message, message_len, retry_at_ms) -> i32` | `0`, or negative if the task is not the plugin's. |
//! | `now_ms() -> i64` | milliseconds since UNIX epoch (wall clock). |
//!
//! The capability names behind these are few and the calls are more of them
//! because capability and call are not the same thing: storage is two calls
//! because reading and writing are separately grantable, and the queue is six
//! because the verbs of a queue are six. The clock is one call because reading
//! the time is one thing to ask for. Which numbers the queue's calls answer
//! with, and which of them mean "not yours", is [`super::tasks`]' business.
//!
//! # What a plugin is told about the call
//!
//! `video_info` hands back the params the kernel forwarded, unchanged. That is
//! the whole of the plugin's context, and it is deliberately not a summary the
//! kernel writes: params are the *complete* context (spec #82), so a
//! `video.fields` call carries the space, the video and the values the chain
//! already has, and a call that is not about one video carries the space it is
//! in rather than an empty object. What a body needs to answer is in there, and
//! the kernel does not add a second channel to say it again. A background
//! instance is in no call at all and reads an empty object (#99).
//!
//! # The two places a plugin's data can go
//!
//! `storage` writes in the plugin's own directory and nowhere else; the
//! confinement is the shape of the name the capability accepts, and
//! [`super::storage`] says why.
//!
//! The log is the other, and it is the same `tracing` the kernel writes to
//! (`crate::logging`): the file the user is asked for when something goes
//! wrong. Every line carries the plugin's name, so a user reading the file can
//! tell whose it is.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use wasmtime::{Caller, Engine, Linker, StoreLimits, StoreLimitsBuilder};

use super::memory::put;
use super::tasks::Queue;
use super::MEMORY_LIMIT;

/// The module every import of a body is defined under.
///
/// One name for all of them, so that a module's import list reads as one list of
/// what it was granted, and so that a new capability is a line someone writes
/// here rather than something a plugin can find on its own (ADR 0044 §1).
const MODULE: &str = "enjoy";

/// The kernel's side of one plugin's instance: everything the imports need to
/// reach, and the limits the store holds it to.
pub(super) struct Guest {
    /// Enforced by wasmtime through [`wasmtime::Store::limiter`], which reads
    /// it out of here on every memory growth.
    pub(super) limits: StoreLimits,
    /// The one directory the `storage` capability can reach.
    data_dir: PathBuf,
    /// Whose instance this is: the owner every `task_*` call speaks for, and
    /// what a line the plugin logs says so.
    plugin: String,
    /// The queue this instance's plugin owns.
    queue: Arc<Queue>,
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
    /// Whether this is the background instance (exporting run).
    background: bool,
}

impl Guest {
    pub(super) fn new(plugin: &str, data_dir: PathBuf, queue: Arc<Queue>) -> Self {
        Self {
            limits: StoreLimitsBuilder::new().memory_size(MEMORY_LIMIT).build(),
            data_dir,
            plugin: plugin.to_string(),
            queue,
            context: String::new(),
            background: false,
        }
    }

    pub(super) fn new_background(plugin: &str, data_dir: PathBuf, queue: Arc<Queue>) -> Self {
        Self {
            background: true,
            ..Self::new(plugin, data_dir, queue)
        }
    }

    pub(super) fn is_background(&self) -> bool {
        self.background
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

    pub(super) fn plugin(&self) -> &str {
        &self.plugin
    }

    pub(super) fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub(super) fn queue(&self) -> &Arc<Queue> {
        &self.queue
    }
}

/// The imports one body's instance is linked against.
///
/// One `func_wrap_async` per import, written out rather than folded into a
/// helper: wasmtime's own bounds for an async host function are the part that
/// has to be got right, and a wrapper that hid them would hide the one thing a
/// reader of a new capability copies. The closure's shape is the same every
/// time — its parameters destructured, its body the function beside it, and the
/// store re-armed once that answer exists.
///
/// The re-arm is on the way *out* rather than on the way in because the stretch
/// of plugin code a call's limits are for comes after the call, not before it:
/// a host call may take far longer than a call's budget (a fetch of a slow site
/// takes as long as the site takes) and the epoch does not interrupt a host
/// future, only wasm. Arming on entry would leave the deadline in the past by
/// the time the plugin's code resumed, and the very next epoch check would stop
/// a background job for having waited. Arming here covers every way out of a
/// function — the early returns included — with one line per import.
pub(super) fn linker(engine: &Engine) -> Result<Linker<Guest>, String> {
    let mut linker = Linker::new(engine);
    linker
        .func_wrap_async(
            MODULE,
            "fetch",
            |mut caller: Caller<'_, Guest>,
             (url_at, url_len, headers_at, headers_len, out, cap): (
                i32,
                i32,
                i32,
                i32,
                i32,
                i32,
            )| {
                Box::new(async move {
                    let answer = super::fetch::fetch(
                        &mut caller,
                        url_at,
                        url_len,
                        headers_at,
                        headers_len,
                        out,
                        cap,
                    )
                    .await;
                    let _ = super::arm(&mut caller);
                    answer
                })
            },
        )
        .map_err(|error| format!("the `fetch` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "storage_read",
            |mut caller: Caller<'_, Guest>, (name, name_len, out, cap): (i32, i32, i32, i32)| {
                Box::new(async move {
                    let answer =
                        super::storage::storage_read(&mut caller, name, name_len, out, cap);
                    let _ = super::arm(&mut caller);
                    answer
                })
            },
        )
        .map_err(|error| format!("the `storage_read` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "storage_write",
            |mut caller: Caller<'_, Guest>, (name, name_len, at, len): (i32, i32, i32, i32)| {
                Box::new(async move {
                    let answer =
                        super::storage::storage_write(&mut caller, name, name_len, at, len);
                    let _ = super::arm(&mut caller);
                    answer
                })
            },
        )
        .map_err(|error| format!("the `storage_write` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "log",
            |mut caller: Caller<'_, Guest>, (level, msg, msg_len): (i32, i32, i32)| {
                Box::new(async move {
                    let answer = log(&mut caller, level, msg, msg_len);
                    let _ = super::arm(&mut caller);
                    answer
                })
            },
        )
        .map_err(|error| format!("the `log` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "video_info",
            |mut caller: Caller<'_, Guest>, (out, cap): (i32, i32)| {
                Box::new(async move {
                    let answer = video_info(&mut caller, out, cap);
                    let _ = super::arm(&mut caller);
                    answer
                })
            },
        )
        .map_err(|error| format!("the `video_info` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "task_push",
            |mut caller: Caller<'_, Guest>,
             (kind_at, kind_len, space_id, video_id, payload_at, payload_len): (
                i32,
                i32,
                i64,
                i64,
                i32,
                i32,
            )| {
                Box::new(async move {
                    let answer = super::tasks::task_push(
                        &mut caller,
                        kind_at,
                        kind_len,
                        space_id,
                        video_id,
                        payload_at,
                        payload_len,
                    );
                    let _ = super::arm(&mut caller);
                    answer
                })
            },
        )
        .map_err(|error| format!("the `task_push` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "task_wait",
            |mut caller: Caller<'_, Guest>, (timeout_ms, out, cap): (i64, i32, i32)| {
                Box::new(async move {
                    let answer = super::tasks::task_wait(&mut caller, timeout_ms, out, cap).await;
                    let _ = super::arm(&mut caller);
                    answer
                })
            },
        )
        .map_err(|error| format!("the `task_wait` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "task_progress",
            |mut caller: Caller<'_, Guest>,
             (id, current, total, label_at, label_len): (i64, i64, i64, i32, i32)| {
                Box::new(async move {
                    let answer = super::tasks::task_progress(
                        &mut caller,
                        id,
                        current,
                        total,
                        label_at,
                        label_len,
                    );
                    let _ = super::arm(&mut caller);
                    answer
                })
            },
        )
        .map_err(|error| format!("the `task_progress` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "task_checkpoint",
            |mut caller: Caller<'_, Guest>, (id,): (i64,)| {
                Box::new(async move {
                    let answer = super::tasks::task_checkpoint(&mut caller, id);
                    let _ = super::arm(&mut caller);
                    answer
                })
            },
        )
        .map_err(|error| format!("the `task_checkpoint` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "task_done",
            |mut caller: Caller<'_, Guest>, (id, fields_at, fields_len): (i64, i32, i32)| {
                Box::new(async move {
                    let answer = super::tasks::task_done(&mut caller, id, fields_at, fields_len);
                    let _ = super::arm(&mut caller);
                    answer
                })
            },
        )
        .map_err(|error| format!("the `task_done` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(
            MODULE,
            "task_fail",
            |mut caller: Caller<'_, Guest>,
             (id, message_at, message_len, retry_at_ms): (i64, i32, i32, i64)| {
                Box::new(async move {
                    let answer = super::tasks::task_fail(
                        &mut caller,
                        id,
                        message_at,
                        message_len,
                        retry_at_ms,
                    );
                    let _ = super::arm(&mut caller);
                    answer
                })
            },
        )
        .map_err(|error| format!("the `task_fail` import could not be defined: {error}"))?;
    linker
        .func_wrap_async(MODULE, "now_ms", |mut caller: Caller<'_, Guest>, ()| {
            Box::new(async move {
                let answer = now_ms();
                let _ = super::arm(&mut caller);
                answer
            })
        })
        .map_err(|error| format!("the `now_ms` import could not be defined: {error}"))?;
    Ok(linker)
}

fn now_ms() -> Result<i64, wasmtime::Error> {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| wasmtime::Error::msg("time went backwards"))?
        .as_millis();
    Ok(ms as i64)
}

/// Writes one line to the log the kernel writes to.
fn log(
    caller: &mut Caller<'_, Guest>,
    level: i32,
    msg_at: i32,
    msg_len: i32,
) -> Result<(), wasmtime::Error> {
    let message = super::memory::text(caller, msg_at, msg_len)?;
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

/// Hands back the params of the call in flight — an empty object, and nothing
/// written, for the background instance, which is not in one (#99).
fn video_info(caller: &mut Caller<'_, Guest>, out: i32, cap: i32) -> Result<i32, wasmtime::Error> {
    if caller.data().is_background() {
        put(caller, out, cap, b"")?;
        return Ok(0);
    }
    let context = caller.data().context.clone();
    put(caller, out, cap, context.as_bytes())?;
    Ok(context.len() as i32)
}
