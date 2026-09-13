use std::path::{Path, PathBuf};

use tauri::Manager;

use crate::error::AppError;

pub(super) fn directory(app: &tauri::AppHandle) -> Result<Option<PathBuf>, AppError> {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        if cfg!(debug_assertions) {
            let directory =
                Path::new(env!("CARGO_MANIFEST_DIR")).join("../resources/ffmpeg/windows-x86_64");
            if directory.join("ffmpeg.exe").is_file() && directory.join("ffprobe.exe").is_file() {
                return Ok(Some(directory));
            }
        } else {
            return app
                .path()
                .resource_dir()
                .map(|directory| Some(directory.join("resources/ffmpeg/windows-x86_64")))
                .map_err(|error| AppError::new("media.tool.failed", error));
        }
    }
    Ok(None)
}

pub(super) fn executable(directory: Option<&Path>, name: &str) -> PathBuf {
    match directory {
        Some(directory) => directory.join(format!("{name}{}", std::env::consts::EXE_SUFFIX)),
        None => PathBuf::from(name),
    }
}

#[cfg(test)]
mod tests {
    use super::executable;
    use std::path::Path;

    #[test]
    fn bundled_tools_use_absolute_paths_even_when_missing() {
        let directory = std::env::temp_dir().join("enjoy missing tools with spaces");
        for name in ["ffmpeg", "ffprobe"] {
            assert_eq!(
                executable(Some(&directory), name),
                directory.join(format!("{name}{}", std::env::consts::EXE_SUFFIX))
            );
            assert_eq!(executable(None, name), Path::new(name));
        }
    }
}
