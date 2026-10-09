use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};

use crate::error::AppError;
use crate::process;
use crate::repository::{lock_shared, Repository};

pub fn play(
    space_id: i64,
    repository: &Arc<Mutex<Repository>>,
    path: &str,
    launch: impl FnOnce(&Path) -> Result<(), AppError>,
) -> Result<(), AppError> {
    // Asked before the player is opened, so that a path the library does not
    // know is reported rather than opened and then failed to record — and asked
    // of the record the path names rather than of every record in the space.
    // The lock is let go again at once: the player runs for as long as the file
    // plays, and the interface goes on reading the library while it does.
    lock_shared(repository)?.require_indexed(space_id, path)?;
    let file = validate_file(path)?;
    launch(&file)?;
    lock_shared(repository)?.record_play(space_id, path)
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
    let mut command = command_for(path);
    let output = process::hidden(&mut command)
        .output()
        .map_err(|error| AppError::new("media.player.start_failed", error))?;
    if !output.status.success() {
        return Err(AppError::new(
            "media.player.start_failed",
            String::from_utf8_lossy(&output.stderr),
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn command_for(path: &Path) -> Command {
    let mut command = Command::new("open");
    command.arg(path);
    command
}

#[cfg(target_os = "linux")]
fn command_for(path: &Path) -> Command {
    let mut command = Command::new("xdg-open");
    command.arg(path);
    command
}

#[cfg(target_os = "windows")]
fn command_for(path: &Path) -> Command {
    let mut command = Command::new("powershell.exe");
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Process -FilePath $env:ENJOY_PLAYBACK_PATH -ErrorAction Stop",
        ])
        .env("ENJOY_PLAYBACK_PATH", path);
    command
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;
    use std::sync::{Arc, Mutex};

    use crate::repository::fixture::{Fixture, Library};
    use crate::repository::Repository;
    use crate::scan::scanner;

    use super::play;

    /// A space holding one record, and the path that record names.
    fn library_with_one_file(fixture: &Fixture) -> (Arc<Mutex<Repository>>, i64, String) {
        let file = fixture.0.join("movie.mp4");
        std::fs::write(&file, b"video").unwrap();
        let root = fixture.0.to_string_lossy().into_owned();
        let Library {
            mut repository,
            space,
        } = fixture.library();
        repository
            .index(space, &root, &scanner::collect(&fixture.0).unwrap())
            .unwrap();
        (
            Arc::new(Mutex::new(repository)),
            space,
            file.to_string_lossy().into_owned(),
        )
    }

    #[test]
    fn the_play_of_a_file_the_library_holds_is_opened_then_recorded() {
        let fixture = Fixture::new();
        let (repository, space, path) = library_with_one_file(&fixture);
        let opened = Cell::new(false);

        play(space, &repository, &path, |file| {
            // The launcher is handed the resolved file rather than the string
            // the record carries, which is what the system's own opener needs.
            opened.set(file.is_file());
            Ok(())
        })
        .unwrap();

        // Opened first, recorded after: the order the two facts are established
        // in is what makes a play that never started leave no history behind.
        assert!(opened.get());
        let row = repository.lock().unwrap().records(space).unwrap().remove(0);
        assert_eq!(row.play_count, 1);
        assert!(row.last_played_at.is_some());
    }

    #[test]
    fn a_path_the_library_does_not_hold_is_refused_before_the_player_is_opened() {
        let fixture = Fixture::new();
        let (repository, space, _) = library_with_one_file(&fixture);
        let stranger = fixture.0.join("not-indexed.mp4");
        std::fs::write(&stranger, b"video").unwrap();
        let opened = Cell::new(false);

        let error = play(space, &repository, &stranger.to_string_lossy(), |_| {
            opened.set(true);
            Ok(())
        })
        .unwrap_err();

        // A file on disk that can be read is not a file the space holds: the
        // question is asked of the record the path names, before anything is
        // started, so that a window is not opened on a play that could not then
        // be recorded.
        assert_eq!(error.code, "media.file.not_found");
        assert!(!opened.get());
    }
}

#[cfg(all(test, target_os = "macos"))]
mod launch_tests {
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
