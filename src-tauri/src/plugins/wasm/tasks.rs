//! The six `task_*` imports: how a plugin sees and drives the kernel's queue.
//!
//! A plugin does not have a queue of its own and does not decide when its work
//! runs. It asks for work to be queued, waits for work it owns, says how far
//! along it is, asks whether it should stop, and says how it ended. The kernel
//! keeps the row and the user reads the task page; the plugin only ever speaks
//! about its own tasks (spec #96 §3).
//!
//! # Whose task is whose
//!
//! The owner is not a parameter. Every call is made by one instance of one
//! plugin, and the plugin's identity is bound when that instance is built — it
//! is the [`Guest`]'s own name, and no argument the guest can send changes it.
//! A call about a task the plugin does not own is therefore a call that cannot
//! answer "yes": it is refused with an error code and a line in the log, and it
//! is **not** a failed call — the plugin is told "no", it does not throw, and
//! the five failures that take a plugin out of the rotation are not counting it.
//!
//! # What the codes mean
//!
//! The imports answer with numbers, and the numbers are one vocabulary:
//!
//! | | |
//! | --- | --- |
//! | `0` / positive | success. `task_push` answers the task's id; `task_wait` the length of the task's JSON; `task_checkpoint` run/pause/cancel as `0`/`1`/`2`; the rest answer `0`. |
//! | `-1` | the request does not apply — the task is not this plugin's, is not there, or is not in a state the action applies to; for `task_wait`, that the host is stopping the plugin and the loop must exit. |
//! | `-2` | the kernel could not reach its own queue. The plugin's request was well formed; this is the host's failure, and the call is left for the plugin to retry rather than being reported as its own mistake. |
//!
//! # `task_wait` is the stop point
//!
//! `task_wait` is the one blocking import, and it is where a plugin's background
//! loop spends its time. It is also the one place the kernel can reach that loop
//! without the plugin running any instructions — the way a plugin that is being
//! switched off is told to finish. It answers `-1` the moment the host is
//! stopping the plugin, whether it was waiting or is asked to wait again, so a
//! loop written as `until task_wait(…) == -1` exits at the next turn.
//!
//! # What is not here
//!
//! The fields a plugin hands to `task_done` are not written here. This file
//! marks the task finished and hands the answer to the landing
//! ([`super::super::landing`]), which does the library write on a thread of its
//! own (spec #96 §6): a cover is a download, and the plugin's import is bounded
//! by a deadline that has no business waiting for one. Everything else about the
//! task's life is the repository's ([`crate::repository::task_states`]), which
//! this file drives rather than reimplements.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::Notify;
use wasmtime::Caller;

use crate::error::AppError;
use crate::model::{Task, VideoField};
use crate::plugins::landing::Landing;
use crate::repository::{lock_shared, Repository};

use super::imports::Guest;
use super::memory::{put, text};
use super::task_shapes::{finished_fields, TaskView};

/// The request does not apply: not the plugin's task, no such task, or not in a
/// state the action applies to. For `task_wait`, "the host is stopping you".
const REFUSED: i32 = -1;

/// The kernel could not reach its own queue.
const UNAVAILABLE: i32 = -2;

/// One plugin's queue: its identity, the shared repository, and the two facts a
/// waiter needs.
///
/// One per plugin rather than one per instance, because a plugin's two instances
/// — the front one that answers mount points and the background one that runs
/// `run` (spec #96 §4, #99) — share exactly one queue: work pushed from a menu
/// is claimed by the background loop, and both have to see the same rows. It is
/// shared between them by `Arc`, created where the body is (`WasmBody::load`).
pub(super) struct Queue {
    /// The owner this queue speaks for. Every task it can see or touch is this
    /// plugin's, and it is what makes an argument-supplied owner unnecessary.
    plugin: String,
    repository: Arc<Mutex<Repository>>,
    /// Where a finished task's fields go, when this body has a library to put
    /// them in. Absent in the tests that are about the queue alone.
    landing: Option<Arc<dyn Landing>>,
    /// Set when the host is stopping the plugin. Once set it stays set: a body
    /// that is out of the rotation has no more work to do, and a loop that
    /// missed the wakeup must still find the answer when it looks again.
    stopped: AtomicBool,
    /// What wakes a waiting `task_wait`: a push into this queue, or [`Self::stop`].
    ///
    /// A notification is a hint, not the news itself — the news is the row in
    /// the repository, and a waiter that is woken re-reads it. That is why a
    /// wakeup that arrives when nobody is waiting can be lost without harm: the
    /// waiter looks before it sleeps, and again after it has registered.
    wake: Notify,
}

impl Queue {
    pub(super) fn new(
        plugin: &str,
        repository: Arc<Mutex<Repository>>,
        landing: Option<Arc<dyn Landing>>,
    ) -> Arc<Self> {
        Arc::new(Self {
            plugin: plugin.to_string(),
            repository,
            landing,
            stopped: AtomicBool::new(false),
            wake: Notify::new(),
        })
    }

    pub(super) fn plugin(&self) -> &str {
        &self.plugin
    }

    /// Tells the interface a row changed, and hands a finished task's answer on.
    ///
    /// Both are the landing's to do because both outlive the plugin's import:
    /// the row is written by the repository, and the answer is written by the
    /// kernel after the plugin's deadline has stopped applying.
    fn finished(&self, task_id: i64) {
        if let Some(landing) = &self.landing {
            landing.changed(task_id);
        }
    }

    fn land(&self, task: Task, fields: Vec<VideoField>) {
        if let Some(landing) = &self.landing {
            landing.land(task, fields);
        }
    }

    /// Tells the plugin to stop, and wakes any `task_wait` that is sleeping.
    pub(super) fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        self.wake.notify_waiters();
    }

    /// Wakes whoever is waiting for work in this queue.
    fn poke(&self) {
        self.wake.notify_waiters();
    }

    fn is_stopped(&self) -> bool {
        self.stopped.load(Ordering::SeqCst)
    }

    fn lock(&self) -> Result<MutexGuard<'_, Repository>, AppError> {
        lock_shared(&self.repository)
    }
}

/// `task_push(kind, kind_len, space_id, video_id, payload, payload_len) -> id`.
///
/// Queues one piece of work for this plugin and answers with its id. The same
/// key already held by a task of this plugin that is not finished answers with
/// *that* task's id instead of adding a second row (spec #96 §1); the owner is
/// this plugin and never an argument.
///
/// `video_id` is `0` for a task that is not about one video; a real id is
/// positive, so the sentinel cannot collide with one.
pub(super) fn task_push(
    caller: &mut Caller<'_, Guest>,
    kind_at: i32,
    kind_len: i32,
    space_id: i64,
    video_id: i64,
    payload_at: i32,
    payload_len: i32,
) -> Result<i64, wasmtime::Error> {
    let kind = text(caller, kind_at, kind_len)?;
    let payload = text(caller, payload_at, payload_len)?;
    if kind.is_empty() {
        tracing::warn!(plugin = %caller.data().plugin(), "A plugin pushed a task with no kind");
        return Ok(REFUSED as i64);
    }
    let queue = caller.data().queue().clone();
    let video = (video_id > 0).then_some(video_id);
    let mut repository = match queue.lock() {
        Ok(repository) => repository,
        Err(error) => {
            tracing::warn!(plugin = %queue.plugin(), code = %error.code, "A plugin's task could not be pushed");
            return Ok(UNAVAILABLE as i64);
        }
    };
    match repository.push_task(Some(queue.plugin()), space_id, video, &kind, &payload) {
        Ok(id) => {
            drop(repository);
            // The push is what a sleeping `task_wait` for this plugin waits for.
            queue.poke();
            Ok(id)
        }
        Err(error) => {
            tracing::warn!(plugin = %queue.plugin(), code = %error.code, "A plugin's task could not be pushed");
            Ok(UNAVAILABLE as i64)
        }
    }
}

/// `task_wait(timeout_ms, out, cap) -> len | 0 | -1`.
///
/// Claims the plugin's earliest runnable task and answers with it as JSON, or
/// waits up to the timeout for one to appear and answers `0` bytes when none
/// does. `-1` is the host stopping the plugin; see this module's docs.
pub(super) async fn task_wait(
    caller: &mut Caller<'_, Guest>,
    timeout_ms: i64,
    out: i32,
    cap: i32,
) -> Result<i32, wasmtime::Error> {
    let queue = caller.data().queue().clone();
    let deadline =
        tokio::time::Instant::now() + std::time::Duration::from_millis(timeout_ms.max(0) as u64);
    // The one place `caller` is written to, so a successful wait reports the
    // same way whichever of the two checks below found the task.
    let mut settle = |taken: Taken| -> Option<Result<i32, wasmtime::Error>> {
        match taken {
            Taken::Stop => Some(Ok(REFUSED)),
            Taken::Broken => Some(Ok(UNAVAILABLE)),
            Taken::Task(json) => {
                Some(put(caller, out, cap, json.as_bytes()).map(|()| json.len() as i32))
            }
            Taken::Idle => None,
        }
    };
    loop {
        if let Some(answer) = settle(take(&queue)) {
            return answer;
        }
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Ok(0);
        }
        let notified = queue.wake.notified();
        tokio::pin!(notified);
        // Registered before the second look below, so a push or a stop that
        // lands between the first look and this line is not lost to the future
        // — it is seen by the second look, which is only reached because
        // interest is registered.
        notified.as_mut().enable();
        if let Some(answer) = settle(take(&queue)) {
            return answer;
        }
        if tokio::time::timeout(remaining, notified).await.is_err() {
            return Ok(0);
        }
    }
}

/// `task_progress(id, current, total, label, label_len) -> 0`.
///
/// `total` (`0` for none) and `label` (empty for none) are optional; the whole
/// triple is written, because a report is a complete answer and a label left
/// over from the last one would say the wrong thing beside the new numbers.
pub(super) fn task_progress(
    caller: &mut Caller<'_, Guest>,
    id: i64,
    current: i64,
    total: i64,
    label_at: i32,
    label_len: i32,
) -> Result<i32, wasmtime::Error> {
    let label = if label_len > 0 {
        Some(text(caller, label_at, label_len)?)
    } else {
        None
    };
    let queue = caller.data().queue().clone();
    if let Err(code) = owned(&queue, id) {
        return Ok(code);
    }
    let total = (total > 0).then_some(total);
    let mut repository = match queue.lock() {
        Ok(repository) => repository,
        Err(error) => {
            tracing::warn!(plugin = %queue.plugin(), code = %error.code, "A plugin's progress could not be written");
            return Ok(UNAVAILABLE);
        }
    };
    match repository.set_task_progress(id, current, total, label.as_deref()) {
        Ok(()) => Ok(0),
        Err(error) => Ok(refused(&queue, error)),
    }
}

/// `task_checkpoint(id) -> 0 run / 1 pause / 2 cancel / -1`.
///
/// The answer is read off the row and is the same answer for as long as the
/// user's request stands (spec #96 §5): a plugin that asks twice gets told twice,
/// which is what makes a loop that checks between requests able to stop.
pub(super) fn task_checkpoint(
    caller: &mut Caller<'_, Guest>,
    id: i64,
) -> Result<i32, wasmtime::Error> {
    let queue = caller.data().queue().clone();
    if let Err(code) = owned(&queue, id) {
        return Ok(code);
    }
    let repository = match queue.lock() {
        Ok(repository) => repository,
        Err(error) => {
            tracing::warn!(plugin = %queue.plugin(), code = %error.code, "A plugin's checkpoint could not be read");
            return Ok(UNAVAILABLE);
        }
    };
    match repository.task_checkpoint(id) {
        Ok(signal) => Ok(match signal {
            crate::model::TaskSignal::Run => 0,
            crate::model::TaskSignal::Pause => 1,
            crate::model::TaskSignal::Cancel => 2,
        }),
        Err(error) => Ok(refused(&queue, error)),
    }
}

/// `task_done(id, fields, fields_len) -> 0`.
///
/// Marks the plugin's running task finished, then hands the fields it produced
/// to the landing (spec #96 §6). The import does not wait for the write: a
/// cover is a download from somebody else's server, and the plugin's call is
/// bounded by a deadline that has no business covering one.
///
/// The fields are read before the row is marked done, so a malformed answer is
/// refused while the task is still running and the plugin can report something
/// it can actually fix. Keys outside the closed set (spec #96 §9) are dropped
/// here as well as in the repository, because the plugin is owed a line in the
/// log that names the key it sent, and the rows the landing reads should be
/// ones the library can store.
pub(super) fn task_done(
    caller: &mut Caller<'_, Guest>,
    id: i64,
    fields_at: i32,
    fields_len: i32,
) -> Result<i32, wasmtime::Error> {
    let queue = caller.data().queue().clone();
    if let Err(code) = owned(&queue, id) {
        return Ok(code);
    }
    let answer = match text(caller, fields_at, fields_len) {
        Ok(answer) => answer,
        Err(error) => {
            tracing::warn!(plugin = %queue.plugin(), task = id, %error, "A plugin's finished fields were not text");
            return Ok(REFUSED);
        }
    };
    let fields = match finished_fields(queue.plugin(), &answer, id) {
        Ok(fields) => fields,
        Err(error) => {
            tracing::warn!(plugin = %queue.plugin(), task = id, %error, "A plugin's finished fields could not be read");
            return Ok(REFUSED);
        }
    };
    let mut repository = match queue.lock() {
        Ok(repository) => repository,
        Err(error) => {
            tracing::warn!(plugin = %queue.plugin(), code = %error.code, "A plugin's task could not be finished");
            return Ok(UNAVAILABLE);
        }
    };
    let task = match repository.task(id) {
        Ok(task) => task,
        Err(error) => return Ok(refused(&queue, error)),
    };
    match repository.complete_task(id) {
        Ok(()) => {}
        Err(error) => return Ok(refused(&queue, error)),
    }
    drop(repository);
    queue.finished(id);
    queue.land(task, fields);
    Ok(0)
}

/// `task_fail(id, message, message_len, retry_at_ms) -> 0`.
///
/// Ends one attempt. `retry_at_ms` is a wall-clock time in milliseconds, or `0`
/// for a failure that will not be retried; with a time the task goes back to
/// waiting for exactly then, and the reason stays on the row (spec #96 §2).
pub(super) fn task_fail(
    caller: &mut Caller<'_, Guest>,
    id: i64,
    message_at: i32,
    message_len: i32,
    retry_at_ms: i64,
) -> Result<i32, wasmtime::Error> {
    let message = text(caller, message_at, message_len)?;
    let queue = caller.data().queue().clone();
    if let Err(code) = owned(&queue, id) {
        return Ok(code);
    }
    let retry_at = (retry_at_ms > 0).then_some(retry_at_ms);
    let mut repository = match queue.lock() {
        Ok(repository) => repository,
        Err(error) => {
            tracing::warn!(plugin = %queue.plugin(), code = %error.code, "A plugin's failure could not be written");
            return Ok(UNAVAILABLE);
        }
    };
    match repository.fail_task(id, &message, retry_at) {
        Ok(()) => Ok(0),
        Err(error) => Ok(refused(&queue, error)),
    }
}

/// Everything one idle turn of [`task_wait`] has to say.
enum Taken {
    /// A runnable task of this plugin's, as JSON.
    Task(String),
    /// Nothing runnable now — the caller waits.
    Idle,
    /// The host is stopping the plugin.
    Stop,
    /// The kernel could not read its own queue.
    Broken,
}

/// One look at the queue: stop first, then the next piece of work.
fn take(queue: &Queue) -> Taken {
    if queue.is_stopped() {
        return Taken::Stop;
    }
    let mut repository = match queue.lock() {
        Ok(repository) => repository,
        Err(error) => {
            tracing::warn!(plugin = %queue.plugin(), code = %error.code, "A plugin's task could not be claimed");
            return Taken::Broken;
        }
    };
    match repository.claim_task(Some(queue.plugin())) {
        Ok(None) => Taken::Idle,
        Ok(Some(task)) => match serde_json::to_string(&TaskView::of(&task)) {
            Ok(json) => Taken::Task(json),
            Err(error) => {
                // A `Task` this side built cannot fail to serialize; a failure
                // here is a bug in the kernel, and it is told apart from the
                // plugin's own answer.
                tracing::warn!(plugin = %queue.plugin(), %error, "A plugin's task could not be rendered");
                Taken::Broken
            }
        },
        Err(error) => {
            tracing::warn!(plugin = %queue.plugin(), code = %error.code, "A plugin's task could not be claimed");
            Taken::Broken
        }
    }
}

/// Refuses a task the caller does not own, or one that is not there.
///
/// This is the identity check the whole module turns on: the repository's own
/// writes guard the *state*, not the owner, so ownership is checked here, once,
/// before any of them runs. A task that belongs to another plugin is refused
/// exactly like one that does not exist — a plugin has no business learning
/// which ids belong to somebody else.
fn owned(queue: &Queue, id: i64) -> Result<(), i32> {
    let repository = match queue.lock() {
        Ok(repository) => repository,
        Err(error) => {
            tracing::warn!(plugin = %queue.plugin(), code = %error.code, "A plugin's task could not be read");
            return Err(UNAVAILABLE);
        }
    };
    match repository.task(id) {
        Ok(task) if task.plugin.as_deref() == Some(queue.plugin()) => Ok(()),
        Ok(_) => {
            tracing::warn!(plugin = %queue.plugin(), task = id, "A plugin reached for a task that is not its own");
            Err(REFUSED)
        }
        Err(error) => {
            tracing::debug!(plugin = %queue.plugin(), task = id, code = %error.code, "A plugin reached for a task that is not there");
            Err(REFUSED)
        }
    }
}

/// The code a repository refusal answers with, and the line it leaves behind.
fn refused(queue: &Queue, error: AppError) -> i32 {
    tracing::debug!(plugin = %queue.plugin(), code = %error.code, "A plugin's task report was refused");
    REFUSED
}
