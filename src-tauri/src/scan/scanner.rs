use std::path::Path;
use std::time::UNIX_EPOCH;
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
        });
    }
    Ok(result)
}
