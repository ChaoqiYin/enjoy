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
mod update;

use error::AppError;
use i18n::{language, native};
use model::{Space, VideoFile};
use repository::Repository;
use scan::control::{space_change_gate, ScanControl, ScanStatus};
use scan::job as scan_job;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use update::UpdateControl;

pub(crate) struct AppState {
    pub(crate) scan: Arc<ScanControl>,
    pub(crate) repository: Arc<Mutex<Repository>>,
    pub(crate) update: Arc<UpdateControl>,
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
    space_id: i64,
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
            space_id,
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
fn list_videos(space_id: i64, state: State<'_, AppState>) -> Result<Vec<VideoFile>, AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .list(space_id)
}

#[tauri::command]
fn current_space(state: State<'_, AppState>) -> Result<Space, AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .current_space()
}

#[tauri::command]
fn list_spaces(state: State<'_, AppState>) -> Result<Vec<Space>, AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .spaces()
}

// The four commands that change which space is being shown, or the set of them,
// all answer the same question: which space is the interface showing now?
// Creating moves into the new one, removing moves out of the one that is gone,
// switching goes where it was told, and renaming a space that happens to be the
// current one answers with its new name. Keeping the answer the same shape is
// what lets the interface adopt it without asking, and so without a moment where
// it is showing a space that no longer exists.
//
// All four are refused while a media task holds the scan slot, for the reason
// written on `space_change_gate`, and all four ask that through `changing_spaces`
// rather than each asking for itself. The interface disables them too, but that
// is only ever an explanation: the rule is the one in that function, and it is
// the one that holds.

/// Runs an operation that changes which space is being shown, or the set of them.
///
/// One gate, asked in one place, is a gate that cannot be left out of one of the
/// four by accident — which is the shape this rule wants, since the four are the
/// same rule asked four times.
fn changing_spaces<T>(
    state: &State<'_, AppState>,
    action: impl FnOnce(&mut Repository) -> Result<T, AppError>,
) -> Result<T, AppError> {
    space_change_gate(state.scan.is_running())?;
    let mut repository = state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?;
    action(&mut repository)
}

#[tauri::command]
fn create_space(name: String, state: State<'_, AppState>) -> Result<Space, AppError> {
    changing_spaces(&state, |repository| repository.create_space(&name))
}

#[tauri::command]
fn rename_space(
    space_id: i64,
    name: String,
    state: State<'_, AppState>,
) -> Result<Space, AppError> {
    changing_spaces(&state, |repository| {
        repository.rename_space(space_id, &name)
    })
}

#[tauri::command]
fn delete_space(space_id: i64, state: State<'_, AppState>) -> Result<Space, AppError> {
    changing_spaces(&state, |repository| repository.delete_space(space_id))
}

#[tauri::command]
fn switch_space(space_id: i64, state: State<'_, AppState>) -> Result<Space, AppError> {
    changing_spaces(&state, |repository| repository.switch_space(space_id))
}

#[tauri::command]
fn list_directories(space_id: i64, state: State<'_, AppState>) -> Result<Vec<String>, AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .directories(space_id)
}

#[tauri::command]
fn remove_video(space_id: i64, path: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .remove(space_id, &path)
}

#[tauri::command]
fn remove_directory(
    space_id: i64,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .remove_directory(space_id, &path)
}

#[tauri::command]
fn add_directory(space_id: i64, path: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .add_directory(space_id, &path)
}

#[tauri::command]
fn set_favorite(
    space_id: i64,
    path: String,
    favorite: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state
        .repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .favorite(space_id, &path, favorite)
}

#[tauri::command]
async fn open_video(
    space_id: i64,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = Arc::clone(&state.repository);
    tauri::async_runtime::spawn_blocking(move || {
        player::play(space_id, &repository, &path, player::launch)
    })
    .await
    .map_err(|error| AppError::new("media.player.start_failed", error))?
}

#[tauri::command]
async fn refresh_video_info(
    space_id: i64,
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
        let wrote = scan::refresh::refresh_video(space_id, &path, &repository, &control, |file| {
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
    space_id: i64,
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
            .list(space_id)?;
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
                    .save_thumbnail(space_id, video, &thumbnail.to_string_lossy())?,
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
    // The first space is named in the language the person is looking at right
    // now: the upgrade happens once, on a machine whose interface language is a
    // fact of that moment, and the name is theirs to change afterwards. That is
    // also why this reads the language before it opens the database.
    let language = language::current(&app.state::<language::LanguageState>())?;
    let path = database_path(app)?;
    let repository = Repository::open(&path, native::translate(&language, "defaultSpace"))?;
    app.manage(AppState {
        repository: Arc::new(Mutex::new(repository)),
        scan: Arc::new(ScanControl::default()),
        update: Arc::new(UpdateControl::default()),
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
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            current_space,
            list_spaces,
            create_space,
            rename_space,
            delete_space,
            switch_space,
            remove_video,
            remove_directory,
            add_directory,
            rescan_directories,
            set_favorite,
            open_video,
            refresh_video_info,
            update::commands::check_for_update,
            update::commands::install_update,
            update::commands::restart_app
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
                // macOS gives a WKWebView no context-menu entry for the Web
                // inspector, and this app turns the default menu bar off, so a
                // debug build would otherwise have no way to open one. The call
                // itself only exists under `debug_assertions` (or the `devtools`
                // feature), so release builds are unchanged.
                #[cfg(debug_assertions)]
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            tracing::error!(diagnostic = %error, "Application runtime failed");
        });
}
