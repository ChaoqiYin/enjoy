use std::path::Path;
use std::time::UNIX_EPOCH;
use std::{fs::File, io::Read};
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
}

/// Collects the videos under `root` for one configured directory.
///
/// A failure that concerns a single entry — the file cannot be opened, its
/// metadata cannot be read or its fingerprint cannot be computed — is handed to
/// `on_file_error` and skipped, so one bad file cannot hold up the rest. Only a
/// failure that concerns the directory itself (`root` cannot be read or is not
/// a directory) is returned, leaving the caller to decide what to do with a
/// directory it cannot scan. Cancellation is never swallowed.
pub fn collect_controlled(
    root: &Path,
    checkpoint: impl Fn() -> Result<(), AppError>,
    mut on_file_error: impl FnMut(AppError),
) -> Result<Vec<ScannedFile>, AppError> {
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
    let mut result = Vec::new();
    for entry in WalkDir::new(root).follow_links(false) {
        checkpoint()?;
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                on_file_error(traversal_error(error, root));
                continue;
            }
        };
        if !entry.file_type().is_file() || !is_video(entry.path()) {
            continue;
        }
        match scanned_file(entry.path(), root, &checkpoint) {
            Ok(file) => result.push(file),
            Err(error) if error.code == "media.scan.cancelled" => return Err(error),
            Err(error) => on_file_error(error),
        }
    }
    Ok(result)
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

fn scanned_file(
    file: &Path,
    root: &Path,
    checkpoint: &impl Fn() -> Result<(), AppError>,
) -> Result<ScannedFile, AppError> {
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
    let mut handle = File::open(file).map_err(|error| AppError::io(error, &path))?;
    let file_md5 = fingerprint(&mut handle, &path, checkpoint)?;
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
        file_md5,
    })
}

fn fingerprint(
    reader: &mut impl Read,
    path: &str,
    checkpoint: impl Fn() -> Result<(), AppError>,
) -> Result<String, AppError> {
    let mut context = md5::Context::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        checkpoint()?;
        let count = reader
            .read(&mut buffer)
            .map_err(|error| AppError::io(error, path))?;
        if count == 0 {
            break;
        }
        context.consume(&buffer[..count]);
    }
    checkpoint()?;
    Ok(format!("{:x}", context.compute()))
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};
    use std::io::Cursor;

    use super::{collect_controlled, fingerprint};
    use crate::error::AppError;
    use crate::repository::tests::Fixture;

    #[cfg(unix)]
    #[test]
    fn an_unreadable_file_is_reported_and_skipped_without_losing_the_rest() {
        use std::fs;
        use std::os::unix::fs::PermissionsExt;

        let fixture = Fixture::new();
        fs::write(fixture.0.join("readable.mp4"), b"video").unwrap();
        let broken = fixture.0.join("broken.mp4");
        fs::write(&broken, b"video").unwrap();
        fs::set_permissions(&broken, fs::Permissions::from_mode(0o000)).unwrap();
        let errors = RefCell::new(Vec::new());
        let files = collect_controlled(
            &fixture.0,
            || Ok(()),
            |error| {
                errors.borrow_mut().push(error.code);
            },
        )
        .unwrap();
        assert_eq!(
            errors.into_inner(),
            vec!["media.scan.permission_denied".to_string()]
        );
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file_name, "readable.mp4");
    }

    #[test]
    fn hashing_is_chunked_and_stops_before_reading_the_remaining_file() {
        let bytes = vec![42; 256 * 1024];
        let mut reader = Cursor::new(&bytes);
        let checkpoints = Cell::new(0);
        let result = fingerprint(&mut reader, "movie.mp4", || {
            checkpoints.set(checkpoints.get() + 1);
            if checkpoints.get() == 2 {
                Err(AppError::new(
                    "media.scan.cancelled",
                    "Cancelled during hashing",
                ))
            } else {
                Ok(())
            }
        });
        assert_eq!(result.unwrap_err().code, "media.scan.cancelled");
        assert!(reader.position() > 0 && reader.position() < bytes.len() as u64);
        assert_eq!(
            fingerprint(&mut Cursor::new(&bytes), "movie.mp4", || Ok(())).unwrap(),
            format!("{:x}", md5::compute(&bytes))
        );
    }
}
