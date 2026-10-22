//! The kernel's own queue owner: the thread that runs the media tasks the
//! three media commands put in.
//!
//! A scan, a thumbnail regeneration and a one-file refresh are all *tasks* in
//! the queue now (spec #96 §3, #101): the command writes the row and answers
//! with its id, and this thread — one per application, holding `plugin IS NULL`
//! — claims them one at a time and runs them. Serial is not a limitation to
//! work around: it *is* the mutual exclusion that `ScanControl` used to enforce
//! with a slot, moved out of the slot and into the queue, where the task page
//! can also see it.
//!
//! # Where the user's pause and cancel land
//!
//! The progress a pass reports and the checkpoint it stops at are the same
//! `ScanControl` they always were; what moved is where a 暂停/继续/取消 is
//! *written*. It is written on the task row (`task_states`), because that is
//! what the task page drives, and the row's owner — [`Runner::run`], here —
//! carries it into the pass by asking [`crate::commands::scan::forward_action`],
//! whose other caller is `scan_action` on the status bar. So the two ways to
//! pause the same pass reach the same place.
//!
//! The one thing that follows from this: `ScanControl` must know *which* task a
//! running pass is, because a request that names a task has to be checked
//! against the pass that is actually running. That is [`ScanControl::task_id`].
//!
//! # What a run ends as
//!
//! A pass ends well (`done`), badly (`failed`, with the reason left on the row
//! for the task page), or by the user's cancel (`cancelled`, which is not a
//! failure and is not reported as one). An application that exits mid-run leaves
//! a `running` row, and start-up puts it back to `pending` (`recover_tasks`) so
//! the sweep resumes on the next launch.

use std::sync::{Arc, Mutex};

use crate::error::{AppError, SCAN_CANCELLED};
use crate::events::Events;
use crate::media::MediaProcessor;
use crate::model::{Task, TaskState};
use crate::repository::{lock_shared, Repository};
use crate::scan::control::ScanControl;
use crate::scan::session;
/// How long an idle owner waits before it looks at the queue again, in
/// milliseconds.
///
/// There is no wakeup channel from the commands to this thread yet (spec #96
/// §3 fixes the walk; the notification is a later refinement), so an idle
/// owner polls. The number is a compromise the task page makes visible: long
/// enough that an idle application is quiet, short enough that a task queued
/// behind a click starts before the user wonders whether the click took.
const IDLE_POLL_MS: u64 = 200;

/// The three task kinds the kernel owns. A `tasks` row with no `plugin` and a
/// `kind` outside this list is data this build cannot carry out, and is failed
/// rather than run as something else (spec #96 §3).
const SCAN: &str = "scan";
const THUMBNAILS: &str = "thumbnails";
const REFRESH: &str = "refresh";

/// The kernel's task owner: what it needs to run any of the three kinds.
///
/// The media tools arrive as a *recipe* rather than a value, because building
/// them reads the application's own directories and can fail — and because a
/// test can hand over one made on a path
/// ([`MediaProcessor::on_path`](crate::media::MediaProcessor::on_path)) without
/// a running application. The closure is called once per claimed task and
/// nothing is remembered between two of them, so a build that failed for one
/// task is not a poisoned owner for the next.
pub(crate) struct Runner {
    pub(crate) repository: Arc<Mutex<Repository>>,
    pub(crate) scan: Arc<ScanControl>,
    pub(crate) events: Arc<dyn Events>,
    media: MediaProvider,
    plugins: Arc<dyn crate::plugins::ScanEvents>,
}

/// How the owner builds the media tools, per task.
type MediaProvider = Box<dyn Fn() -> Result<MediaProcessor, AppError> + Send + Sync>;

impl Runner {
    pub(crate) fn new(
        repository: Arc<Mutex<Repository>>,
        scan: Arc<ScanControl>,
        events: Arc<dyn Events>,
        plugins: Arc<dyn crate::plugins::ScanEvents>,
        media: MediaProvider,
    ) -> Self {
        Self {
            repository,
            scan,
            events,
            media,
            plugins,
        }
    }
    /// Looks for one runnable task and runs it, or waits a little and looks
    /// again.
    ///
    /// The return value is whether anything was run, which is what a test needs
    /// to drive the loop one turn at a time; the application's thread ignores it
    /// and loops forever.
    pub(crate) fn once(&self) -> Result<bool, AppError> {
        let Some(task) = self.claim()? else {
            std::thread::sleep(std::time::Duration::from_millis(IDLE_POLL_MS));
            return Ok(false);
        };
        // Told before it runs: the task page shows a task that has started, and
        // a claim is the one moment that becomes true.
        self.events.task_changed(task.id);
        self.run(&task)?;
        Ok(true)
    }

    /// Runs the owner's loop until the process ends.
    ///
    /// A failure to reach the queue is logged and the loop goes on: an owner
    /// that stopped at the first database problem would leave every media task
    /// from then on unrun and none of them refusable, which is worse than a
    /// thread that keeps trying.
    pub(crate) fn run_forever(&self) {
        loop {
            if let Err(error) = self.once() {
                tracing::error!(code = error.code, "A media task could not be run");
                std::thread::sleep(std::time::Duration::from_millis(IDLE_POLL_MS));
            }
        }
    }

    fn claim(&self) -> Result<Option<Task>, AppError> {
        lock_shared(&self.repository)?.claim_task(None)
    }

    /// Carries out one claimed task, whichever way it ends.
    fn run(&self, task: &Task) -> Result<(), AppError> {
        let outcome = self.execute(task);
        self.settle(task, outcome)
    }

    /// Runs the work the task names, with a fresh slot for it.
    ///
    /// A pass that ended by the user's cancel is not a failure: it is reported
    /// as the task ending the way the user asked, and the row says
    /// `cancelled`.
    fn execute(&self, task: &Task) -> Result<(), AppError> {
        let result = match task.kind.as_str() {
            SCAN => self.scan_pass(task),
            THUMBNAILS => self.thumbnail_pass(task),
            REFRESH => self.refresh_pass(task),
            other => Err(AppError::new(
                "task.unknown_kind",
                format!("No kernel task is called {other}"),
            )
            .with_param("kind", other)),
        };
        match result {
            Err(error) if error.code == SCAN_CANCELLED => Ok(()),
            other => other,
        }
    }

    fn scan_pass(&self, task: &Task) -> Result<(), AppError> {
        let media = (self.media)()?;
        let guard = self.scan.begin_task(task.id);
        let videos = session::rescan(
            guard,
            task.space_id,
            &self.repository,
            &self.scan,
            &media,
            self.events.as_ref(),
        )?;
        self.announce_completed(task.space_id, &videos);
        Ok(())
    }

    fn thumbnail_pass(&self, task: &Task) -> Result<(), AppError> {
        let media = (self.media)()?;
        let path = path_from_payload(&task.payload);
        let guard = self.scan.begin_task(task.id);
        session::regenerate_thumbnails(
            guard,
            task.space_id,
            path,
            &self.repository,
            &self.scan,
            &media,
            self.events.as_ref(),
        )
    }

    fn refresh_pass(&self, task: &Task) -> Result<(), AppError> {
        let Some(path) = path_from_payload(&task.payload) else {
            return Err(AppError::new(
                "task.bad_payload",
                "A refresh task names no file",
            ));
        };
        let media = (self.media)()?;
        let guard = self.scan.begin_task(task.id);
        session::refresh_info(
            guard,
            task.space_id,
            &path,
            &self.repository,
            &self.scan,
            &media,
            self.events.as_ref(),
        )
    }

    /// Writes the ending the row gets, and tells the task page.
    ///
    /// Three endings and no fourth: the work finished, the user stopped it, or
    /// it failed. A failure is reported as a media error as well, because the
    /// user watching the library deserves to be told why nothing moved — the
    /// task page's row is not where they are looking.
    fn settle(&self, task: &Task, outcome: Result<(), AppError>) -> Result<(), AppError> {
        let mut repository = lock_shared(&self.repository)?;
        match task.state {
            // The user's cancel reached the pass at a checkpoint, and the pass
            // ended there: carry that onto the row.
            TaskState::Running if signal_is_cancel(&repository, task.id) => {
                repository.apply_task_cancel(task.id)?;
            }
            TaskState::Running => match &outcome {
                Ok(()) => repository.complete_task(task.id)?,
                Err(error) => {
                    repository.fail_task(task.id, &error.code, None)?;
                }
            },
            // A cancel that came in while the work was finishing: the row says
            // what the user asked for, and nothing here overrides it.
            _ => {}
        }
        drop(repository);
        self.events.task_changed(task.id);
        if let Err(error) = &outcome {
            self.events.media_error(error);
        }
        Ok(())
    }

    /// Tells the plugins a space's scan finished, the way the command used to.
    ///
    /// It moved here with the work: the command no longer waits for a scan, so
    /// the only place that knows one ended is the owner that ran it.
    fn announce_completed(&self, space_id: i64, videos: &[crate::model::VideoFile]) {
        use crate::plugins::mount_points::{SpaceRef, VideoRef};
        let video_refs: Vec<VideoRef> = videos
            .iter()
            .map(|v| VideoRef {
                id: v.id,
                path: v.path.clone(),
            })
            .collect();
        self.plugins
            .scan_completed(&SpaceRef { id: space_id }, &video_refs);
    }
}

/// Whether the row the pass ran under now carries a cancel request.
///
/// Read after the pass ended rather than before, so a cancel that arrived
/// *during* the last moments of the work is seen: the pass stopped at a
/// checkpoint it never reached, but the user still asked for it, and the row
/// should say `cancelled` rather than `done`.
fn signal_is_cancel(repository: &Repository, id: i64) -> bool {
    repository
        .task(id)
        .map(|task| task.cancel_requested || task.state == TaskState::Cancelled)
        .unwrap_or(false)
}

/// The `path` a task's payload carries, when it has one.
///
/// The payload is the one part of a task that is not a column, because it is
/// different per kind: a refresh names a file, a whole-space thumbnail sweep
/// names none, and a scan names nothing at all. What the kernel commands write
/// is `{"path": "..."}`; anything else — a missing key, a malformed document —
/// is a payload this build cannot act on, and the caller decides what that
/// means for its kind.
fn path_from_payload(payload: &str) -> Option<String> {
    if payload.is_empty() {
        return None;
    }
    serde_json::from_str::<serde_json::Value>(payload)
        .ok()
        .and_then(|value| {
            value
                .get("path")
                .and_then(|path| path.as_str())
                .map(str::to_string)
        })
}
