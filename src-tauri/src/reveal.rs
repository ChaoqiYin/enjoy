use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::AppError;

pub fn parent_directory(path: &Path) -> Result<PathBuf, AppError> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::new("media.directory.invalid", "File has no parent directory"))?;
    let directory = parent
        .canonicalize()
        .map_err(|error| AppError::io(error, &parent.to_string_lossy()))?;
    if !directory.is_dir() {
        return Err(AppError::new(
            "media.directory.invalid",
            "Parent is not a directory",
        ));
    }
    Ok(directory)
}

pub fn reveal(path: &Path) -> Result<(), AppError> {
    let directory = parent_directory(path)?;
    #[cfg(target_os = "macos")]
    let output = if path.is_file() {
        Command::new("open").arg("-R").arg(path).output()
    } else {
        Command::new("open").arg(&directory).output()
    };
    #[cfg(target_os = "linux")]
    let output = Command::new("xdg-open").arg(&directory).output();
    #[cfg(target_os = "windows")]
    let output = Command::new("explorer.exe").arg(&directory).output();
    let output = output.map_err(|error| AppError::new("media.directory.open_failed", error))?;
    if !output.status.success() {
        return Err(AppError::new(
            "media.directory.open_failed",
            String::from_utf8_lossy(&output.stderr),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parent_directory;
    use std::fs;

    #[test]
    fn missing_video_still_resolves_existing_parent() {
        let root = std::env::temp_dir().join(format!("enjoy-reveal-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        assert_eq!(
            parent_directory(&root.join("missing clip.mp4")).unwrap(),
            root.canonicalize().unwrap()
        );
        assert!(parent_directory(&root.join("missing-folder/clip.mp4")).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
