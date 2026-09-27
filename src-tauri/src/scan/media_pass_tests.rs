//! The pass's own rules, with nothing behind it but a script.
//!
//! These are the rules the two loops agreed on and could not test: what a
//! failure moves and what it does not, what the interface is told and when, and
//! what a pass that ends early leaves behind. None of them needs a media tool,
//! a file on disk or a real library — which is the point of the work arriving
//! as an argument rather than being reached for from inside.

use std::sync::{Arc, Mutex};

use crate::error::AppError;
use crate::events::Recorded;
use crate::model::VideoFile;
use crate::repository::fixture::{Fixture, Library};
use crate::repository::Repository;
use crate::scan::control::{ScanControl, ScanStatus};
use crate::scan::media_pass::{self, MediaOperations, Outcome, Step};

fn video(name: &str) -> VideoFile {
    VideoFile {
        id: 1,
        path: format!("/library/{name}"),
        file_name: name.into(),
        folder_path: "/library".into(),
        file_size: 10,
        modified_at: 1,
        media_complete: false,
        duration_ms: None,
        width: None,
        height: None,
        codec: None,
        thumbnail_path: None,
        favorite: false,
        play_count: 0,
        last_played_at: None,
        created_at: 0,
        updated_at: 0,
    }
}

fn library(fixture: &Fixture) -> Arc<Mutex<Repository>> {
    let Library { repository, .. } = fixture.library();
    Arc::new(Mutex::new(repository))
}

/// A pass whose answers are written down rather than earned, so a rule about
/// failures can be reached without arranging a failure in the world.
#[derive(Default)]
struct Scripted {
    steps: &'static [Step],
    /// The files, and the step on each, that did not get through.
    failing: Vec<(&'static str, Step)>,
    /// The file and step that end the pass, if any does.
    stopping: Option<(&'static str, Step)>,
    /// One entry per step run: was the interface already told which file this
    /// was, at the moment the tool was reached for?
    named: Mutex<Vec<bool>>,
    /// One entry per file walked: the name, and what `finish` was told.
    walked: Mutex<Vec<String>>,
    finished: Mutex<Vec<(String, bool)>>,
}

impl Scripted {
    fn scripted(&self, video: &VideoFile, step: Step) -> bool {
        self.failing
            .iter()
            .any(|(name, scripted)| *name == video.file_name && *scripted == step)
    }
}

impl MediaOperations for Scripted {
    fn steps(&self) -> &'static [Step] {
        self.steps
    }

    fn run(
        &self,
        step: Step,
        video: &VideoFile,
        _repository: &Arc<Mutex<Repository>>,
        control: &ScanControl,
    ) -> Result<Outcome, AppError> {
        self.named
            .lock()
            .unwrap()
            .push(control.status().current_path == video.path);
        if self.stopping == Some((video.file_name.as_str(), step)) {
            // The failure that ends the pass, as opposed to the one it counts:
            // a tool that could not do its job leaves the file not ready, and
            // only something the pass itself cannot carry on from ends it. The
            // code is a real one because every code in the source is checked
            // against the translations, and a test does not get to invent one.
            return Err(AppError::new(
                "media.database.lock_failed",
                "the index refused the write",
            ));
        }
        if self.scripted(video, step) {
            return Ok(Outcome::Failed(AppError::new(
                "media.metadata.failed",
                "the tool could not do its job",
            )));
        }
        Ok(Outcome::Through)
    }

    fn finish(
        &self,
        video: &VideoFile,
        metadata_ready: bool,
        _repository: &Arc<Mutex<Repository>>,
    ) -> Result<(), AppError> {
        self.walked.lock().unwrap().push(video.file_name.clone());
        self.finished
            .lock()
            .unwrap()
            .push((video.file_name.clone(), metadata_ready));
        Ok(())
    }
}

#[test]
fn a_step_that_failed_is_counted_and_reported_but_not_counted_ready() {
    let fixture = Fixture::new();
    let repository = library(&fixture);
    let control = ScanControl::default();
    let events = Recorded::default();
    let operations = Scripted {
        steps: &[Step::Metadata, Step::Thumbnail],
        failing: vec![("a.mp4", Step::Thumbnail)],
        ..Default::default()
    };

    media_pass::run(
        [video("a.mp4")].iter(),
        ScanStatus::default(),
        "thumbnails",
        &repository,
        &control,
        &events,
        &operations,
    )
    .unwrap();

    let status = control.status();
    assert_eq!(status.phase, "complete");
    // The failure moved the failure count and nothing else. Both loops this
    // replaces worked this out by sampling the failure count before and after
    // each step and comparing the two — and the file is the only place where
    // getting that comparison wrong would show.
    assert_eq!(status.failures, 1);
    assert_eq!(status.processed, 1);
    assert_eq!(status.metadata_ready, 1);
    assert_eq!(status.thumbnails_ready, 0);
    assert_eq!(events.media_error_codes(), vec!["media.metadata.failed"]);
    assert_eq!(
        operations.finished.lock().unwrap().as_slice(),
        [("a.mp4".to_owned(), true)]
    );
}

#[test]
fn the_interface_is_told_which_file_is_being_worked_on_before_the_tools_run() {
    let fixture = Fixture::new();
    let repository = library(&fixture);
    let control = ScanControl::default();
    let events = Recorded::default();
    let operations = Scripted {
        steps: &[Step::Thumbnail],
        ..Default::default()
    };

    media_pass::run(
        [video("a.mp4"), video("b.mp4")].iter(),
        ScanStatus::default(),
        "thumbnails",
        &repository,
        &control,
        &events,
        &operations,
    )
    .unwrap();

    // A media tool runs for seconds. Which file it is running for is the one
    // thing the interface has to know before it starts, and it is the first
    // thing a pass that skips a step, or reports after the fact, would lose.
    assert_eq!(operations.named.lock().unwrap().as_slice(), [true, true]);
    assert_eq!(
        operations.walked.lock().unwrap().as_slice(),
        ["a.mp4", "b.mp4"]
    );
    assert_eq!(control.status().processed, 2);
}

#[test]
fn a_pass_that_ends_early_leaves_the_phase_to_the_slot() {
    let fixture = Fixture::new();
    let repository = library(&fixture);
    let control = ScanControl::default();
    let events = Recorded::default();
    let operations = Scripted {
        steps: &[Step::Metadata, Step::Thumbnail],
        stopping: Some(("a.mp4", Step::Thumbnail)),
        ..Default::default()
    };

    let error = media_pass::run(
        [video("a.mp4")].iter(),
        ScanStatus::default(),
        "thumbnails",
        &repository,
        &control,
        &events,
        &operations,
    )
    .unwrap_err();

    // Work that stopped the pass is not work that finished. The pass says so by
    // leaving the phase where it stands rather than closing on `complete`:
    // `ScanGuard::drop` is what turns that into the outcome, and it has not run
    // yet. A pass that closed itself would report a library that is done when it
    // is not.
    assert_eq!(error.code, "media.database.lock_failed");
    assert_eq!(control.status().phase, "processing");
}
