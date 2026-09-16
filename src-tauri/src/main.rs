#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod error;
mod i18n;
mod media;
mod model;
mod player;
mod process;
mod repository;
mod scan;
mod settings;

use error::AppError;
use i18n::{language, native};
use model::VideoFile;
use repository::Repository;
use scan::control::{ScanControl, ScanStatus};
use scan::job as scan_job;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};

struct AppState {
    scan: Arc<ScanControl>,
    repository: Arc<Mutex<Repository>>,
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::new("media.database.path_failed", e))?;
    std::fs::create_dir_all(&directory)
        .map_err(|e| AppError::io(e, &directory.to_string_lossy()))?;
    Ok(directory.join("enjoy.db"))
}

#[tauri::command]
async fn rescan_directories(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<VideoFile>, AppError> {
    let repository = Arc::clone(&state.repository);
    let control = Arc::clone(&state.scan);
    let guard = control.begin()?;
    let events = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let cache = database_path(&app)?.with_file_name("thumbnails");
        let media = media::MediaProcessor::for_app(&app, cache)?;
        // No command starts a background scan: every scan is user-initiated.
        scan_job::run(
            &media,
            &repository,
            &control,
            false,
            |status| {
                let _ = app.emit("scan-progress", status);
            },
            |error| {
                let _ = app.emit("media-error", &error);
            },
        )
    })
    .await
    .map_err(|error| AppError::new("media.scan.failed", error))?;
    let _ = events.emit("scan-progress", state.scan.status());
    let _ = events.emit("library-changed", ());
    result
}

#[tauri::command]
fn scan_action(
    action: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.scan.action(&action)?;
    let _ = app.emit("scan-progress", state.scan.status());
    Ok(())
}

#[tauri::command]
fn scan_status(state: State<'_, AppState>) -> ScanStatus {
    state.scan.status()
}

#[tauri::command]
fn list_videos(state: State<'_, AppState>) -> Result<Vec<VideoFile>, AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .list()
}

#[tauri::command]
fn list_directories(state: State<'_, AppState>) -> Result<Vec<String>, AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .directories()
}

#[tauri::command]
fn remove_video(path: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .remove(&path)
}

#[tauri::command]
fn remove_directory(path: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .remove_directory(&path)
}

#[tauri::command]
fn add_directory(path: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .add_directory(&path)
}

#[tauri::command]
fn set_favorite(path: String, favorite: bool, state: State<'_, AppState>) -> Result<(), AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .favorite(&path, favorite)
}

#[tauri::command]
async fn open_video(path: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let repository = Arc::clone(&state.repository);
    tauri::async_runtime::spawn_blocking(move || player::play(&repository, &path, player::launch))
        .await
        .map_err(|error| AppError::new("media.player.start_failed", error))?
}

#[tauri::command]
async fn refresh_video_info(
    path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = Arc::clone(&state.repository);
    let control = Arc::clone(&state.scan);
    let guard = control.begin()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let processor = media::MediaProcessor::for_app(
            &app,
            database_path(&app)?.with_file_name("thumbnails"),
        )?;
        let wrote = scan::refresh::refresh_video(&path, &repository, &control, |file| {
            processor.probe(file, || control.is_cancelled())
        })?;
        if wrote {
            let _ = app.emit("library-changed", ());
        }
        Ok(())
    })
    .await
    .map_err(|error| AppError::new("media.metadata.failed", error))?
}

#[tauri::command]
async fn regenerate_thumbnails(
    path: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = Arc::clone(&state.repository);
    let control = Arc::clone(&state.scan);
    let guard = control.begin()?;
    let events = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let videos = repository
            .lock()
            .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
            .list()?;
        let cache = database_path(&app)?.with_file_name("thumbnails");
        let media = media::MediaProcessor::for_app(&app, cache)?;
        let videos: Vec<_> = videos
            .iter()
            .filter(|video| path.as_ref().is_none_or(|path| &video.path == path))
            .collect();
        let mut progress = ScanStatus {
            phase: "processing".into(),
            operation: "thumbnails".into(),
            discovered: videos.len(),
            indexed: videos.len(),
            metadata_ready: videos.iter().filter(|video| video.width.is_some()).count(),
            ..Default::default()
        };
        control.publish(progress.clone());
        let _ = app.emit("scan-progress", control.status());
        for video in videos {
            progress.current_path = video.path.clone();
            control.publish(progress.clone());
            let _ = app.emit("scan-progress", control.status());
            control.checkpoint()?;
            let failures_before_thumbnail = progress.failures;
            let thumbnail = media.thumbnail(
                std::path::Path::new(&video.path),
                video.id,
                video.modified_at,
                || control.is_cancelled(),
            );
            match thumbnail {
                Ok(thumbnail) => repository
                    .lock()
                    .map_err(|_| {
                        AppError::new("media.database.lock_failed", "Database lock poisoned")
                    })?
                    .save_thumbnail(video, &thumbnail.to_string_lossy())?,
                Err(error) => {
                    if path.is_some() || error.code == "media.scan.cancelled" {
                        return Err(error);
                    }
                    progress.failures += 1;
                    let _ = app.emit("media-error", &error);
                }
            }
            if progress.failures == failures_before_thumbnail {
                progress.thumbnails_ready += 1;
            }
            progress.processed += 1;
            progress.current_path.clear();
            control.publish(progress.clone());
            let _ = app.emit("scan-progress", control.status());
        }
        control.checkpoint()?;
        progress.phase = "complete".into();
        control.publish(progress);
        Ok(())
    })
    .await
    .map_err(|error| AppError::new("media.thumbnail.failed", error))?;
    let _ = events.emit("scan-progress", state.scan.status());
    let _ = events.emit("library-changed", ());
    result
}

#[tauri::command]
fn initialize_backend(app: &tauri::AppHandle) -> Result<(), AppError> {
    language::get_language(app.state::<language::LanguageState>())?;
    let path = database_path(app)?;
    let repository = Repository::open(&path)?;
    app.manage(AppState {
        repository: Arc::new(Mutex::new(repository)),
        scan: Arc::new(ScanControl::default()),
    });
    Ok(())
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();
    tauri::Builder::default()
        .enable_macos_default_menu(false)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            language::get_language,
            language::set_language,
            settings::get_settings,
            settings::save_settings,
            regenerate_thumbnails,
            scan_action,
            scan_status,
            list_videos,
            list_directories,
            remove_video,
            remove_directory,
            add_directory,
            rescan_directories,
            set_favorite,
            open_video,
            refresh_video_info
        ])
        .setup(|app| {
            app.manage(language::load(app.handle()));
            let result = initialize_backend(app.handle());
            if let Err(error) = result {
                native::startup_failure(app.handle(), &error);
                return Ok(());
            }
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window.show() {
                    let error = AppError::new("app.startup.failed", error);
                    native::startup_failure(app.handle(), &error);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            tracing::error!(diagnostic = %error, "Application runtime failed");
        });
}
