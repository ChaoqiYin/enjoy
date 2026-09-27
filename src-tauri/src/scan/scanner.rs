use std::io;
use std::path::Path;

use walkdir::WalkDir;

use crate::error::{AppError, SCAN_CANCELLED};
use crate::model::{FileStamp, Found, ScannedFile};

#[cfg(test)]
pub fn collect(root: &Path) -> Result<Vec<ScannedFile>, AppError> {
    match read_directory(
        root,
        || Ok(()),
        |error| panic!("Unexpected file error: {}", error.code),
    )? {
        Found::Read { files, .. } => Ok(files),
        other => panic!("Expected a readable directory, found {other:?}"),
    }
}

/// Whether a path this run failed to read is still there.
///
/// One question, two answers, and they lead to opposite places: a path that is
/// not there has no records left to keep, and a path that could not be read has
/// records that must not be taken away. Only one failure is an absence; every
/// other failure is a fact about this run.
///
/// `Path::exists` looks like this question and is not: it is
/// `metadata(..).is_ok()`, so every failure reads as an absence.
fn still_there(error: &io::Error) -> bool {
    error.kind() != io::ErrorKind::NotFound
}

/// Reads one configured directory, and says what it turned out to be.
///
/// This is where 过期视频记录 is decided. Nothing downstream asks the question
/// again: the verdict travels with the path and the repository carries it out
/// rather than working it out a second time from what it is handed.
///
/// Deciding it needs the reason a read failed, and this is the only place that
/// reason is still available — an `AppError` has already lost it, because its
/// code is chosen from a kind and the kind does not survive the conversion.
pub fn read_directory(
    path: &Path,
    checkpoint: impl Fn() -> Result<(), AppError>,
    on_file_error: impl FnMut(AppError),
) -> Result<Found, AppError> {
    let metadata = match path.metadata() {
        Ok(metadata) => metadata,
        Err(error) => {
            return Ok(if still_there(&error) {
                Found::Unreachable
            } else {
                Found::Gone
            })
        }
    };
    if !metadata.is_dir() {
        return Ok(Found::NotADirectory);
    }
    // The resolved path is what earlier scans indexed, so a configured directory
    // that is a symlink keeps matching its own records. A path that cannot be
    // resolved is walked as it was written instead.
    let root = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    match collect_controlled(&root, checkpoint, on_file_error) {
        Ok(collected) => Ok(Found::Read {
            files: collected.files,
            unreadable: collected.unreadable,
        }),
        Err(error) if error.code == SCAN_CANCELLED => Err(error),
        // Counted rather than reported as a failure: one directory that cannot
        // be read must not stop the other directories from being cleaned up,
        // and that count is where the interface says so.
        Err(_) => Ok(Found::Unreachable),
    }
}

/// What one pass over a directory found.
#[derive(Debug)]
struct Collected {
    /// The videos this pass indexed.
    files: Vec<ScannedFile>,
    /// The paths that failed this pass although they are still on disk: a file
    /// whose metadata could not be read, a subtree that could not be listed.
    /// They are absent from `files`, so without this list their existing
    /// records would read as files that had disappeared; they are kept
    /// instead, untouched.
    unreadable: Vec<String>,
}

/// Collects the videos under `root`, which the caller has already found to be a
/// directory.
///
/// Discovery only reads metadata: it never opens a video, so a file the user
/// may not read is still indexed, and its failure to be processed shows up in
/// the media phase instead (ADR 0004). A failure that concerns a single entry —
/// its metadata cannot be read — is handed to `on_file_error` and skipped, so
/// one bad entry cannot hold up the rest. Only a failure that concerns the
/// directory itself — it cannot be listed — is returned, for
/// [`read_directory`] to read as a directory nothing is known about.
/// Cancellation is never swallowed.
///
/// `checkpoint` runs once per directory entry. That is the only place left
/// where a scan in progress can be paused or cancelled without waiting for the
/// pass to end: hashing used to check every 64 KB block, and with no content
/// read there is no finer step than an entry (ADR 0004).
fn collect_controlled(
    root: &Path,
    checkpoint: impl Fn() -> Result<(), AppError>,
    mut on_file_error: impl FnMut(AppError),
) -> Result<Collected, AppError> {
    let path = root.to_string_lossy();
    // The root is listed once up front. WalkDir reports a root it cannot list
    // as an error on that one entry, which the loop below skips like any other
    // bad entry — so without this check a directory that cannot be read would
    // come back as an empty result, and an empty result means "every video in
    // it is gone".
    std::fs::read_dir(root).map_err(|error| AppError::io(error, &path))?;
    let mut files = Vec::new();
    let mut unreadable = Vec::new();
    for entry in WalkDir::new(root).follow_links(false) {
        checkpoint()?;
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                // A traversal error with no `io::Error` behind it — a symlink
                // loop, a path too deep — is not an absence, so the records
                // under it are kept.
                let still_here = error.io_error().map(still_there).unwrap_or(true);
                note_unreadable(error.path().unwrap_or(root), still_here, &mut unreadable);
                on_file_error(traversal_error(error, root));
                continue;
            }
        };
        if !entry.file_type().is_file() || !is_video(entry.path()) {
            continue;
        }
        match scanned_file(entry.path(), root) {
            Ok(file) => files.push(file),
            Err(failed) => {
                note_unreadable(entry.path(), failed.still_there, &mut unreadable);
                on_file_error(failed.error);
            }
        }
    }
    Ok(Collected { files, unreadable })
}

/// Records a failed path only while the path is still there. A path that has
/// disappeared leaves nothing behind: its record is stale and must go.
fn note_unreadable(path: &Path, still_there: bool, unreadable: &mut Vec<String>) {
    if still_there {
        unreadable.push(path.to_string_lossy().into_owned());
    }
}

/// A file this pass failed to read, and what its failure said.
///
/// The two halves are read off the same `io::Error` at the one moment both are
/// still available: what to report, and whether the file is still there. The
/// second decides whether the record survives, so it is not something to derive
/// again from the first — `AppError` carries a code chosen from a kind, and the
/// kind is gone by then.
struct Failed {
    error: AppError,
    still_there: bool,
}

impl Failed {
    fn of(error: io::Error, path: &str) -> Self {
        Self {
            still_there: still_there(&error),
            error: AppError::io(error, path),
        }
    }
}

fn traversal_error(error: walkdir::Error, root: &Path) -> AppError {
    let path = error.path().unwrap_or(root).to_string_lossy().into_owned();
    match error.into_io_error() {
        Some(error) => AppError::io(error, &path),
        None => AppError::new("media.filesystem.failed", "Directory traversal failed"),
    }
}

fn is_video(path: &Path) -> bool {
    [
        "mp4", "mkv", "avi", "mov", "webm", "m4v", "mpg", "mpeg", "wmv",
    ]
    .iter()
    .any(|value| {
        path.extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case(value))
    })
}

/// Reads what identifies a file, from its metadata alone: the file is never
/// opened, so a pass over a large library reads no content at all (ADR 0004).
fn scanned_file(file: &Path, root: &Path) -> Result<ScannedFile, Failed> {
    let path = file.to_string_lossy().into_owned();
    let metadata = file.metadata().map_err(|error| Failed::of(error, &path))?;
    let stamp = FileStamp::from_metadata(&metadata).map_err(|error| Failed::of(error, &path))?;
    Ok(ScannedFile {
        path,
        file_name: file
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        folder_path: file.parent().unwrap_or(root).to_string_lossy().into_owned(),
        file_size: stamp.file_size,
        modified_at: stamp.modified_at,
    })
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use super::{read_directory, still_there};
    use crate::error::AppError;
    use crate::model::Found;
    use crate::repository::fixture::Fixture;

    #[cfg(unix)]
    use std::cell::RefCell;
    #[cfg(unix)]
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    #[cfg(unix)]
    #[test]
    fn a_file_whose_permissions_deny_reading_is_still_indexed() {
        let fixture = Fixture::new();
        fs::write(fixture.0.join("readable.mp4"), b"video").unwrap();
        let locked = fixture.0.join("locked.mp4");
        fs::write(&locked, b"video").unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let errors = RefCell::new(Vec::new());
        let found = read_directory(
            &fixture.0,
            || Ok(()),
            |error| {
                errors.borrow_mut().push(error.code);
            },
        )
        .unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        // Discovery decides what is in the library from metadata alone, so it
        // sees a file it may not read as any other file. The price is the
        // one ADR 0004 accepts: a file that cannot be opened is no longer
        // noticed here -- it is indexed, and reading its content fails later,
        // in the media phase, where the failure is counted and notified.
        assert!(errors.into_inner().is_empty());
        let Found::Read { files, unreadable } = found else {
            panic!("expected a readable directory, found {found:?}");
        };
        let mut names: Vec<_> = files.iter().map(|file| file.file_name.clone()).collect();
        names.sort();
        assert_eq!(names, vec!["locked.mp4", "readable.mp4"]);
        assert!(unreadable.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn a_configured_directory_that_cannot_be_listed_is_read_as_unknown() {
        let fixture = Fixture::new();
        let locked = fixture.0.join("locked");
        fs::create_dir(&locked).unwrap();
        fs::write(locked.join("movie.mp4"), b"video").unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let found = read_directory(&locked, || Ok(()), |_| {});
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        // Not an empty result: a directory that cannot be listed must not come
        // back as one holding nothing, because holding nothing is how a
        // directory whose videos all went away is read. It comes back as one
        // nothing is known about, which keeps its records.
        assert!(matches!(found.unwrap(), Found::Unreachable));
    }

    #[cfg(unix)]
    #[test]
    fn a_locked_subtree_is_reported_and_the_rest_of_the_directory_is_collected() {
        let fixture = Fixture::new();
        let locked = fixture.0.join("locked");
        fs::create_dir(&locked).unwrap();
        fs::write(locked.join("stranded.mp4"), b"video").unwrap();
        fs::write(fixture.0.join("kept.mp4"), b"video").unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let errors = RefCell::new(Vec::new());
        let found = read_directory(
            &fixture.0,
            || Ok(()),
            |error| {
                errors.borrow_mut().push(error.code);
            },
        )
        .unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(
            errors.into_inner(),
            vec!["media.scan.permission_denied".to_string()]
        );
        let Found::Read { files, unreadable } = found else {
            panic!("expected a readable directory, found {found:?}");
        };
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file_name, "kept.mp4");
        // The subtree is recorded so the records under it survive, and the file
        // it holds is not among the collected files.
        assert_eq!(unreadable, vec![locked.to_string_lossy().into_owned()]);
    }

    #[test]
    fn a_cancelled_pass_stops_at_the_next_directory_entry() {
        let fixture = Fixture::new();
        for name in ["one.mp4", "two.mp4", "three.mp4"] {
            std::fs::write(fixture.0.join(name), b"video").unwrap();
        }
        let checkpoints = Cell::new(0);
        let result = read_directory(
            &fixture.0,
            || {
                checkpoints.set(checkpoints.get() + 1);
                if checkpoints.get() == 2 {
                    Err(AppError::new(
                        "media.scan.cancelled",
                        "Cancelled while walking",
                    ))
                } else {
                    Ok(())
                }
            },
            |_| {},
        );
        // Cancellation is never swallowed: the pass stops where it was told to
        // rather than walking the rest of the directory. The checkpoint runs
        // once per entry -- with discovery reading no content there is no finer
        // step left (ADR 0004) -- so the count also says the walk did not go on.
        assert_eq!(result.unwrap_err().code, "media.scan.cancelled");
        assert_eq!(checkpoints.get(), 2);
    }

    #[test]
    fn only_an_absence_is_an_absence() {
        // The rule the whole verdict rests on, and the one `Path::exists` gets
        // wrong: it is `metadata(..).is_ok()`, so a failure to read a path reads
        // as the path being gone, and a path being gone is a record deleted.
        // Written over the error rather than over a file system so that it holds
        // on the platform the application ships on: the tests that need a real
        // unreadable path are `cfg(unix)`, and this one is not.
        use std::io::{Error, ErrorKind};
        assert!(!still_there(&Error::from(ErrorKind::NotFound)));
        assert!(still_there(&Error::from(ErrorKind::PermissionDenied)));
        assert!(still_there(&Error::from(ErrorKind::Other)));
    }

    #[test]
    fn a_configured_directory_that_is_gone_is_read_as_gone() {
        let fixture = Fixture::new();
        let found = read_directory(&fixture.0.join("not-there"), || Ok(()), |_| {}).unwrap();
        // Its records are cleared: nothing it held outlived it.
        assert!(matches!(found, Found::Gone));
    }

    #[test]
    fn a_configured_path_that_is_a_file_is_not_a_directory() {
        let fixture = Fixture::new();
        let file = fixture.0.join("movie.mp4");
        std::fs::write(&file, b"video").unwrap();
        let found = read_directory(&file, || Ok(()), |_| {}).unwrap();
        // Nothing is known about what it holds, so its records stand -- and it is
        // not an 不可访问目录, which is a video directory that could not be listed.
        assert!(matches!(found, Found::NotADirectory));
    }

    #[test]
    fn a_readable_directory_reports_what_it_holds() {
        let fixture = Fixture::new();
        std::fs::write(fixture.0.join("movie.mp4"), b"video").unwrap();
        let found = read_directory(&fixture.0, || Ok(()), |_| {}).unwrap();
        let Found::Read { files, unreadable } = found else {
            panic!("expected a readable directory, found {found:?}");
        };
        assert_eq!(files.len(), 1);
        assert!(unreadable.is_empty());
    }
}
