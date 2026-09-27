use crate::events::Recorded;
use crate::media::MediaProcessor;
use crate::repository::fixture::{Fixture, FIRST_SPACE};
use crate::repository::Repository;
use crate::scan::control::ScanControl;
use crate::scan::scanner;
use crate::scan::session;
use std::sync::{Arc, Mutex};

/// A space with one file in it that no media tool can read, so a pass over it
/// fails for a reason the test does not have to arrange beyond the bytes.
fn space_with_an_unreadable_file(fixture: &Fixture) -> (Arc<Mutex<Repository>>, i64, String) {
    std::fs::write(fixture.0.join("broken.mp4"), b"not a video").unwrap();
    let mut repository = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    let root = fixture.0.to_string_lossy().into_owned();
    repository
        .replace_videos(space, &[(root, scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    let path = repository.list(space).unwrap().remove(0).path;
    (Arc::new(Mutex::new(repository)), space, path)
}

#[test]
fn a_pass_over_an_empty_space_reports_the_phases_and_the_library_change() {
    let fixture = Fixture::new();
    let repository = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    let repository = Arc::new(Mutex::new(repository));
    let control = Arc::new(ScanControl::default());
    let media = MediaProcessor::on_path(fixture.0.join("cache"));
    let events = Recorded::default();
    let guard = control.begin().unwrap();

    session::regenerate_thumbnails(guard, space, None, &repository, &control, &media, &events)
        .unwrap();

    // Nothing was in the space, so the two phases are the whole story — and the
    // change event says the interface should read the library again.
    assert_eq!(events.scan_phases(), vec!["processing", "complete"]);
    assert_eq!(events.library_changes(), 1);
    assert_eq!(control.status().phase, "complete");
}

#[test]
fn a_sweep_counts_an_unreadable_file_instead_of_stopping_at_it() {
    let fixture = Fixture::new();
    let (repository, space, _) = space_with_an_unreadable_file(&fixture);
    let control = Arc::new(ScanControl::default());
    let media = MediaProcessor::on_path(fixture.0.join("cache"));
    let events = Recorded::default();
    let guard = control.begin().unwrap();

    session::regenerate_thumbnails(guard, space, None, &repository, &control, &media, &events)
        .unwrap();

    // The sweep went on: the failure is counted and told to the interface, and
    // the pass still ends `complete` rather than as an error the caller has to
    // read. This is the rule the desktop walkthrough of batch regeneration
    // established, and it is the one the two loops had written down twice.
    assert_eq!(events.media_error_codes().len(), 1);
    let status = control.status();
    assert_eq!(status.failures, 1);
    assert_eq!(status.processed, 1);
    // A file that failed is not a file that is ready — the arithmetic both
    // loops worked out by comparing the failure count before and after.
    assert_eq!(status.thumbnails_ready, 0);
    assert_eq!(status.phase, "complete");
}

#[test]
fn the_slot_is_released_before_the_interface_hears_the_outcome() {
    let fixture = Fixture::new();
    let (repository, space, path) = space_with_an_unreadable_file(&fixture);
    let control = Arc::new(ScanControl::default());
    let media = MediaProcessor::on_path(fixture.0.join("cache"));
    let events = Recorded::default();
    let guard = control.begin().unwrap();

    // One file asked for by name: its failure is the answer to the request,
    // rather than a number in a sweep.
    let error = session::regenerate_thumbnails(
        guard,
        space,
        Some(path),
        &repository,
        &control,
        &media,
        &events,
    )
    .unwrap_err();
    assert_ne!(error.code, "");

    // The last thing the interface is told is the phase the slot left behind,
    // which is what `ScanGuard::drop` decides. Reporting before the guard lands
    // would leave the interface on "processing" forever, and that is a mistake
    // no test of the loop itself would catch.
    assert_eq!(events.scan_phases().last().unwrap(), "failed");
    assert_eq!(control.status().phase, "failed");
    assert_eq!(events.library_changes(), 1);
}
