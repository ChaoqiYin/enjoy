mod queue;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

use crate::error::AppError;
use crate::watcher::queue::WatchQueue;
use crate::AppState;

pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let (sender, receiver) = mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(sender, notify::Config::default()) {
            Ok(watcher) => watcher,
            Err(error) => {
                report(&app, error);
                return;
            }
        };
        let mut watched = BTreeSet::<PathBuf>::new();
        let mut reported = BTreeSet::<PathBuf>::new();
        let mut pending = WatchQueue::default();
        loop {
            let state = app.state::<AppState>();
            let directories = match state.repository.lock() {
                Ok(repository) => repository.directories(),
                Err(_) => return,
            };
            let directories = match directories {
                Ok(paths) => paths
                    .into_iter()
                    .map(PathBuf::from)
                    .collect::<BTreeSet<_>>(),
                Err(error) => {
                    let _ = app.emit("media-error", &error);
                    return;
                }
            };
            pending.retain(&directories);
            reported.retain(|path| directories.contains(path));
            for path in watched
                .difference(&directories)
                .cloned()
                .collect::<Vec<_>>()
            {
                if let Err(error) = watcher.unwatch(&path) {
                    report(&app, error);
                }
                watched.remove(&path);
                pending.remove(&path);
            }
            for path in &directories {
                if matches!(path.metadata(), Err(error) if error.kind() == std::io::ErrorKind::NotFound)
                {
                    if watched.remove(path) {
                        let _ = watcher.unwatch(path);
                    }
                    pending.remove(path);
                    let result = state
                        .repository
                        .lock()
                        .map_err(|_| {
                            AppError::new("media.database.lock_failed", "Database lock poisoned")
                        })
                        .and_then(|repository| {
                            repository.mark_directory_unavailable(&path.to_string_lossy())
                        });
                    match result {
                        Ok(count) if count > 0 => {
                            let _ = app.emit("library-changed", ());
                        }
                        Err(error) => {
                            let _ = app.emit("media-error", &error);
                        }
                        _ => {}
                    }
                }
            }
            for path in directories
                .difference(&watched)
                .cloned()
                .collect::<Vec<_>>()
            {
                match watcher.watch(&path, RecursiveMode::Recursive) {
                    Ok(()) => {
                        reported.remove(&path);
                        watched.insert(path.clone());
                        pending.push(path.clone(), Instant::now());
                    }
                    Err(error) => {
                        if reported.insert(path.clone()) {
                            report(&app, error);
                        }
                    }
                }
            }
            match receiver.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(event)) if relevant(&event) => {
                    for root in &watched {
                        if event.paths.iter().any(|path| path.starts_with(root)) {
                            pending.push(root.clone(), Instant::now());
                        }
                    }
                }
                Ok(Err(error)) => report(&app, error),
                Err(RecvTimeoutError::Disconnected) => return,
                _ => {}
            }
            if state.scan.is_running() {
                continue;
            }
            if let Some(path) = pending.pop_ready(Instant::now()) {
                let result = tauri::async_runtime::block_on(crate::scan_directory_impl(
                    path.to_string_lossy().into_owned(),
                    app.clone(),
                    app.state::<AppState>(),
                    true,
                ));
                if let Err(error) = result {
                    if error.code == "media.scan.busy" {
                        pending.push(path, Instant::now());
                    } else if error.code != "media.scan.cancelled" {
                        let _ = app.emit("media-error", &error);
                    }
                }
            }
        }
    });
}

fn report(app: &tauri::AppHandle, error: notify::Error) {
    let error = AppError::new("media.watch.failed", error);
    let _ = app.emit("media-error", &error);
}

fn relevant(event: &Event) -> bool {
    if matches!(event.kind, EventKind::Access(_) | EventKind::Other) {
        return false;
    }
    if matches!(
        event.kind,
        EventKind::Remove(notify::event::RemoveKind::Folder)
            | EventKind::Modify(notify::event::ModifyKind::Name(_))
    ) {
        return true;
    }
    event
        .paths
        .iter()
        .any(|path| is_video(path) || path.is_dir() || path.extension().is_none())
}

fn is_video(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    [
        "mp4", "mkv", "avi", "mov", "webm", "m4v", "mpg", "mpeg", "wmv",
    ]
    .iter()
    .any(|value| extension.eq_ignore_ascii_case(value))
}

#[cfg(test)]
mod tests {
    use super::relevant;
    use notify::{
        event::{AccessKind, CreateKind},
        Event, EventKind,
    };
    use std::path::PathBuf;

    #[test]
    fn media_changes_trigger_scans_but_cache_and_access_do_not() {
        assert!(relevant(
            &Event::new(EventKind::Create(CreateKind::File))
                .add_path(PathBuf::from("/movies/CLIP.MP4"))
        ));
        assert!(!relevant(
            &Event::new(EventKind::Create(CreateKind::File))
                .add_path(PathBuf::from("/movies/cache.jpg"))
        ));
        assert!(!relevant(
            &Event::new(EventKind::Access(AccessKind::Any))
                .add_path(PathBuf::from("/movies/clip.mp4"))
        ));
    }
}

#[cfg(test)]
mod integration_tests;
