use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::UpdaterExt;

use crate::error::AppError;
use crate::AppState;

use super::control::{
    describe, download_gate, install_gate, is_supported, DownloadTracker, ProgressThrottle,
    UpdateCheck, UpdateProgress,
};

/// Asks the release endpoint whether a newer version exists.
///
/// On any platform other than Windows this answers without touching the
/// network, so the macOS build has no update traffic at all.
#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<UpdateCheck, AppError> {
    let current_version = app.package_info().version.to_string();
    if !is_supported() {
        return Ok(UpdateCheck {
            supported: false,
            current_version,
            available: None,
            ready_to_restart: false,
        });
    }
    let updater = app
        .updater()
        .map_err(|error| AppError::new("update.check_failed", error))?;
    let update = updater
        .check()
        .await
        .map_err(|error| AppError::new("update.check_failed", error))?;
    if let Some(update) = update.as_ref() {
        state.update.remember(update.clone());
    }
    Ok(UpdateCheck {
        supported: true,
        current_version,
        available: update.as_ref().map(describe),
        ready_to_restart: state.update.ready_version().is_some(),
    })
}

/// Downloads and verifies the offered release. Progress goes out as
/// `update-progress` events; the return value only tells the caller it ended.
#[tauri::command]
pub async fn install_update(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    let control = Arc::clone(&state.update);
    download_gate(is_supported(), control.is_downloading())?;
    let update = control.pending()?;
    control.begin_download()?;
    let events = app.clone();
    let version = update.version.clone();
    let mut tracker = DownloadTracker::default();
    let mut throttle = ProgressThrottle::default();
    let result = update
        .download(
            |chunk, total| {
                let downloaded = tracker.record(chunk, total);
                if throttle.should_emit(downloaded, tracker.total()) {
                    let _ = events.emit(
                        "update-progress",
                        UpdateProgress {
                            phase: "downloading".into(),
                            downloaded,
                            total: tracker.total(),
                            version: version.clone(),
                        },
                    );
                }
            },
            || {},
        )
        .await;
    match result {
        Ok(bytes) => {
            control.finish_download(bytes);
            let _ = app.emit(
                "update-progress",
                UpdateProgress {
                    phase: "ready".into(),
                    downloaded: 0,
                    total: None,
                    version,
                },
            );
            Ok(())
        }
        Err(error) => {
            control.fail_download();
            Err(AppError::new("update.download_failed", error))
        }
    }
}

/// Hands the verified installer to the platform installer and exits.
///
/// On Windows this starts the NSIS installer with `/P /R` and then terminates
/// the process, so the call does not return and the installer is what brings
/// Enjoy back. Kept synchronous because both of those expect the main thread.
#[tauri::command]
pub fn restart_app(state: State<'_, AppState>) -> Result<(), AppError> {
    let scanning = state.scan.is_running();
    install_gate(
        is_supported(),
        scanning,
        state.update.ready_version().is_some(),
    )?;
    let (update, bytes) = state.update.take_installer()?;
    update
        .install(&bytes)
        .map_err(|error| AppError::new("update.install_failed", error))
}
