use std::path::Path;
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

use crate::error::AppError;
use crate::model::ScannedFile;

#[cfg(test)]
pub fn collect(root: &Path) -> Result<Vec<ScannedFile>, AppError> {
    collect_controlled(
        root,
        || Ok(()),
        |error| panic!("Unexpected file error: {}", error.code),
    )
    .map(|collected| collected.files)
}

/// What one pass over a configured directory found.
#[derive(Debug)]
pub struct Collected {
    /// The videos this pass indexed.
    pub files: Vec<ScannedFile>,
    /// The paths that failed this pass although they are still on disk: a file
    /// whose metadata could not be read, a subtree that could not be listed.
    /// They are absent from `files`, so without this list their existing
    /// records would read as files that had disappeared; they are kept
    /// instead, untouched.
    pub unreadable: Vec<String>,
}

/// Collects the videos under `root` for one configured directory.
///
/// Discovery only reads metadata: it never opens a video, so a file the user
/// may not read is still indexed, and its failure to be processed shows up in
/// the media phase instead (ADR 0004). A failure that concerns a single entry —
/// its metadata cannot be read — is handed to `on_file_error` and skipped, so
/// one bad entry cannot hold up the rest. Only a failure that concerns the
/// directory itself (`root` cannot be read or is not a directory) is returned,
/// leaving the caller to decide what to do with a directory it cannot scan.
/// Cancellation is never swallowed.
///
/// `checkpoint` runs once per directory entry. That is the only place left
/// where a scan in progress can be paused or cancelled without waiting for the
/// pass to end: hashing used to check every 64 KB block, and with no content
/// read there is no finer step than an entry (ADR 0004).
pub fn collect_controlled(
    root: &Path,
    checkpoint: impl Fn() -> Result<(), AppError>,
    mut on_file_error: impl FnMut(AppError),
) -> Result<Collected, AppError> {
    let path = root.to_string_lossy();
    let metadata = root
        .metadata()
        .map_err(|error| AppError::io(error, &path))?;
    if !metadata.is_dir() {
        return Err(AppError::new(
            "media.directory.invalid",
            "Scan root is not a directory",
        ));
    }
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
                note_unreadable(error.path().unwrap_or(root), &mut unreadable);
                on_file_error(traversal_error(error, root));
                continue;
            }
        };
        if !entry.file_type().is_file() || !is_video(entry.path()) {
            continue;
        }
        match scanned_file(entry.path(), root) {
            Ok(file) => files.push(file),
            Err(error) if error.code == "media.scan.cancelled" => return Err(error),
            Err(error) => {
                note_unreadable(entry.path(), &mut unreadable);
                on_file_error(error);
            }
        }
    }
    Ok(Collected { files, unreadable })
}

/// Records a failed path only while the path is still there. A path that has
/// disappeared leaves nothing behind: its record is stale and must go.
fn note_unreadable(path: &Path, unreadable: &mut Vec<String>) {
    if path.exists() {
        unreadable.push(path.to_string_lossy().into_owned());
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
fn scanned_file(file: &Path, root: &Path) -> Result<ScannedFile, AppError> {
    let path = file.to_string_lossy().into_owned();
    let metadata = file
        .metadata()
        .map_err(|error| AppError::io(error, &path))?;
    let modified = metadata
        .modified()
        .map_err(|error| AppError::io(error, &path))?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    Ok(ScannedFile {
        path,
        file_name: file
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        folder_path: file.parent().unwrap_or(root).to_string_lossy().into_owned(),
        file_size: i64::try_from(metadata.len()).unwrap_or(i64::MAX),
        modified_at: i64::try_from(modified).unwrap_or(i64::MAX),
    })
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use super::collect_controlled;
    use crate::error::AppError;
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
        let collected = collect_controlled(
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
        let mut names: Vec<_> = collected
            .files
            .iter()
            .map(|file| file.file_name.clone())
            .collect();
        names.sort();
        assert_eq!(names, vec!["locked.mp4", "readable.mp4"]);
        assert!(collected.unreadable.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn a_configured_directory_that_cannot_be_listed_is_an_error_and_not_an_empty_result() {
        let fixture = Fixture::new();
        let locked = fixture.0.join("locked");
        fs::create_dir(&locked).unwrap();
        fs::write(locked.join("movie.mp4"), b"video").unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let result = collect_controlled(&locked, || Ok(()), |_| {});
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(result.unwrap_err().code, "media.scan.permission_denied");
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
        let collected = collect_controlled(
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
        assert_eq!(collected.files.len(), 1);
        assert_eq!(collected.files[0].file_name, "kept.mp4");
        // The subtree is recorded so the records under it survive, and the file
        // it holds is not among the collected files.
        assert_eq!(
            collected.unreadable,
            vec![locked.to_string_lossy().into_owned()]
        );
    }

    #[test]
    fn a_cancelled_pass_stops_at_the_next_directory_entry() {
        let fixture = Fixture::new();
        for name in ["one.mp4", "two.mp4", "three.mp4"] {
            std::fs::write(fixture.0.join(name), b"video").unwrap();
        }
        let checkpoints = Cell::new(0);
        let result = collect_controlled(
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
}
