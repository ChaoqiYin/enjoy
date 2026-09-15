use std::path::Path;
use std::time::UNIX_EPOCH;
use std::{fs::File, io::Read};
use walkdir::WalkDir;

use crate::error::AppError;
use crate::model::ScannedFile;

#[cfg(test)]
pub fn collect(root: &Path) -> Result<Vec<ScannedFile>, AppError> {
    collect_controlled(root, || Ok(()))
}

pub fn collect_controlled(
    root: &Path,
    checkpoint: impl Fn() -> Result<(), AppError>,
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
        let entry = entry.map_err(|error| {
            let path = error.path().unwrap_or(root).to_string_lossy().into_owned();
            match error.into_io_error() {
                Some(error) => AppError::io(error, &path),
                None => AppError::new("media.filesystem.failed", "Directory traversal failed"),
            }
        })?;
        if !entry.file_type().is_file() {
            continue;
        }
        let extension = entry
            .path()
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if ![
            "mp4", "mkv", "avi", "mov", "webm", "m4v", "mpg", "mpeg", "wmv",
        ]
        .iter()
        .any(|value| extension.eq_ignore_ascii_case(value))
        {
            continue;
        }
        let path = entry.path().to_string_lossy().into_owned();
        let metadata = entry
            .path()
            .metadata()
            .map_err(|error| AppError::io(error, &path))?;
        let modified = metadata
            .modified()
            .map_err(|error| AppError::io(error, &path))?
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let mut file = File::open(entry.path()).map_err(|error| AppError::io(error, &path))?;
        let file_md5 = fingerprint(&mut file, &path, &checkpoint)?;
        result.push(ScannedFile {
            path,
            file_name: entry.file_name().to_string_lossy().into_owned(),
            folder_path: entry
                .path()
                .parent()
                .unwrap_or(root)
                .to_string_lossy()
                .into_owned(),
            file_size: i64::try_from(metadata.len()).unwrap_or(i64::MAX),
            modified_at: i64::try_from(modified).unwrap_or(i64::MAX),
            file_md5,
        });
    }
    Ok(result)
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
    use std::cell::Cell;
    use std::io::Cursor;

    use super::fingerprint;
    use crate::error::AppError;

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
