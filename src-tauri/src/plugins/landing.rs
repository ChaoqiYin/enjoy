//! What happens after a plugin says it is finished (spec #96 §6).
//!
//! `task_done` is the plugin saying it has done the work. Writing what it
//! produced into the library is the kernel's own follow-through, and it is
//! deliberately not part of that call: a cover is a download from somebody
//! else's server, and a plugin's import is bounded by the call's deadline. A
//! `task_done` that waited for a cover would be a task that failed because the
//! site was slow, which is not what the plugin did wrong.
//!
//! So the work is handed to one thread and done in this order:
//!
//! 1. the fields become [`VideoField`]s, with the plugin's id as their source;
//! 2. a `cover` address is fetched by the kernel ([`cover::settle`]);
//! 3. the fields are written, so what the plugin just found is in the library
//!    immediately;
//! 4. the `video.fields` chain is asked again and its answer written, so a
//!    plugin the user has put ahead of this one still has the last word. The
//!    write is an upsert, so an empty answer leaves step 3's values standing;
//! 5. the interface is told the library changed.
//!
//! One thread for every plugin rather than one per task, because the steps are
//! short and the alternative is a thread per finished scrape. Order between
//! two landings is the order the tasks finished in, which is the order the
//! user watched them finish in.
//!
//! # When it fails
//!
//! A landing that cannot write is a line in the log and nothing else: the
//! plugin's work really did finish, so the task stays `done`; there is no row
//! left to fail and no plugin to blame. The blind spot is the one spec #96
//! records — the notification the user gets for a failed landing is a log
//! line, not a message.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex, Weak};

use crate::error::AppError;
use crate::events::Events;
use crate::model::{Task, VideoField};
use crate::repository::{lock_shared, Repository};

use super::cover;
use super::mount_points::{SpaceRef, VideoRef};
use super::PluginHost;

/// What a finished plugin's answer sets off.
///
/// A port rather than the thread itself so that the two halves can be tested
/// apart: the queue can be shown handing over exactly the fields and the task
/// it accepted without waiting on a database, and the landing can be exercised
/// without a wasm module.
pub(crate) trait Landing: Send + Sync {
    /// One task's row changed, and the task page should read it again.
    fn changed(&self, task_id: i64);

    /// Writes one finished task's fields into the library.
    ///
    /// Returns at once; the work happens on the landing thread.
    fn land(&self, task: Task, fields: Vec<VideoField>);
}

/// The landing the running application uses: one thread, one library.
pub(crate) struct FieldLanding {
    jobs: Sender<Job>,
    events: Arc<dyn Events>,
}

struct Job {
    task: Task,
    fields: Vec<VideoField>,
}

impl FieldLanding {
    /// Starts the landing thread.
    ///
    /// The host is held weakly and the events strongly: the landing thread
    /// outlives nothing here, but the host owns the bodies whose queues point
    /// back at this landing, and a strong reference would be a cycle of
    /// owners that never lets either go.
    pub(crate) fn spawn(
        repository: Arc<Mutex<Repository>>,
        covers: PathBuf,
        events: Arc<dyn Events>,
        plugins: Weak<PluginHost>,
    ) -> Self {
        let (jobs, work) = mpsc::channel::<Job>();
        let worker_events = Arc::clone(&events);
        if let Err(error) = std::thread::Builder::new()
            .name("enjoy-plugin-landing".to_string())
            .spawn(move || {
                let runtime = match tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                {
                    Ok(runtime) => runtime,
                    Err(error) => {
                        tracing::error!("the landing runtime could not be made: {error}");
                        return;
                    }
                };
                for job in work {
                    land_one(
                        &repository,
                        &covers,
                        worker_events.as_ref(),
                        plugins.upgrade().as_deref(),
                        &runtime,
                        job,
                    );
                }
            })
        {
            tracing::error!("the landing thread could not be started: {error}");
        }
        Self { jobs, events }
    }
}

impl Landing for FieldLanding {
    fn changed(&self, task_id: i64) {
        self.events.task_changed(task_id);
    }

    fn land(&self, task: Task, fields: Vec<VideoField>) {
        if let Err(error) = self.jobs.send(Job { task, fields }) {
            let task = error.0.task;
            tracing::warn!(
                task = task.id,
                plugin = task.plugin.as_deref().unwrap_or("kernel"),
                "a finished task's fields could not be handed to the landing thread"
            );
        }
    }
}

/// Lands one task, on the landing thread's runtime.
///
/// Failures are logged rather than returned: there is no caller left to hand
/// one to, and the task is `done` either way.
fn land_one(
    repository: &Mutex<Repository>,
    covers: &Path,
    events: &dyn Events,
    plugins: Option<&PluginHost>,
    runtime: &tokio::runtime::Runtime,
    job: Job,
) {
    let plugin = job.task.plugin.clone().unwrap_or_default();
    match land_now(
        repository, covers, events, plugins, runtime, &job.task, job.fields,
    ) {
        Ok(()) => {}
        Err(error) => tracing::warn!(
            task = job.task.id,
            plugin = %plugin,
            code = %error.code,
            "a finished task's fields could not be landed"
        ),
    }
}

/// The five steps, written so a test can call them without a thread.
///
/// The runtime is passed in because step 2 and step 4 fetch covers, and a fetch
/// is a wait on somebody else's server.
pub(crate) fn land_now(
    repository: &Mutex<Repository>,
    covers: &Path,
    events: &dyn Events,
    plugins: Option<&PluginHost>,
    runtime: &tokio::runtime::Runtime,
    task: &Task,
    fields: Vec<VideoField>,
) -> Result<(), AppError> {
    let Some(video_id) = task.video_id else {
        // A plugin task is queued against a video (spec #96 §10); a row without
        // one has nothing for a field to belong to. Not an error, and not
        // silent: a plugin that pushes a task this way has made a mistake the
        // log can show.
        tracing::warn!(
            task = task.id,
            plugin = task.plugin.as_deref().unwrap_or("kernel"),
            "a finished task had no video, so there was nowhere to land its fields"
        );
        return Ok(());
    };
    let path = {
        let library = lock_shared(repository)?;
        library.path_of(task.space_id, video_id)?
    };
    // The fields are this plugin's answer whether or not a later plugin
    // overrides them in step 4: what a plugin wrote is recorded as its own.
    let mut landed = fields;
    runtime.block_on(cover::settle(covers, video_id, &mut landed));
    {
        let mut library = lock_shared(repository)?;
        library.save_fields(video_id, &landed)?;
    }
    if let Some(host) = plugins {
        let answered = host.video_fields(
            &SpaceRef { id: task.space_id },
            &VideoRef { id: video_id, path },
        );
        let mut chain: Vec<VideoField> = answered
            .into_iter()
            .map(|field| VideoField {
                key: field.key,
                value: field.value,
                source_plugin: field.source_plugin,
            })
            .collect();
        runtime.block_on(cover::settle(covers, video_id, &mut chain));
        let mut library = lock_shared(repository)?;
        library.save_fields(video_id, &chain)?;
    }
    events.library_changed();
    Ok(())
}
