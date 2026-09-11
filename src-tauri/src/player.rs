use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};

use crate::error::AppError;
use crate::repository::Repository;

pub fn play(
    repository: &Arc<Mutex<Repository>>,
    path: &str,
    launch: impl FnOnce(&Path) -> Result<(), AppError>,
) -> Result<(), AppError> {
    {
        let guard = repository
            .lock()
            .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?;
        if !guard.list()?.iter().any(|video| video.path == path) {
            return Err(AppError::new(
                "media.file.not_found",
                "Video is not indexed",
            ));
        }
    }
    let file = validate_file(path)?;
    launch(&file)?;
    repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .record_play(path)
}

fn validate_file(path: &str) -> Result<PathBuf, AppError> {
    let file = std::fs::canonicalize(path).map_err(|error| AppError::io(error, path))?;
    if !file.is_file() {
        return Err(AppError::new(
            "media.player.invalid_file",
            "Playback target is not a file",
        ));
    }
    Ok(file)
}

pub fn launch(path: &Path) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    let output = Command::new("open").arg(path).output();
    #[cfg(target_os = "linux")]
    let output = Command::new("xdg-open").arg(path).output();
    #[cfg(target_os = "windows")]
    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Process -FilePath $env:ENJOY_PLAYBACK_PATH -ErrorAction Stop",
        ])
        .env("ENJOY_PLAYBACK_PATH", path)
        .output();
    let output = output.map_err(|error| AppError::new("media.player.start_failed", error))?;
    if !output.status.success() {
        return Err(AppError::new(
            "media.player.start_failed",
            String::from_utf8_lossy(&output.stderr),
        ));
    }
    Ok(())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::launch;

    #[test]
    fn system_open_failure_returns_localizable_error() {
        let missing =
            std::env::temp_dir().join(format!("enjoy-missing-playback-{}.mp4", std::process::id()));
        assert!(!missing.exists());
        let error = launch(&missing).unwrap_err();
        assert_eq!(error.code, "media.player.start_failed");
        let payload = serde_json::to_value(error).unwrap();
        assert!(payload["errorId"].as_str().is_some_and(|id| !id.is_empty()));
    }
}
