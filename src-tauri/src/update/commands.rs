use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Config as UpdaterConfig, UpdaterExt};

use crate::error::AppError;
use crate::AppState;

use super::control::{
    describe, download_gate, install_gate, is_supported, ProgressThrottle, UpdateCheck,
    UpdateProgress,
};
use super::{download, verify};

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
///
/// The transfer is this module's own rather than the plugin's, because the
/// plugin's reads its response in one pass and keeps nothing when a connection
/// ends early: on a link that drops every few seconds, a release of this size
/// could never arrive. What comes with taking it over is the signature check
/// the plugin used to do on the way out, which is why the payload is verified
/// here before anything is held.
#[tauri::command]
pub async fn install_update(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    let control = Arc::clone(&state.update);
    download_gate(is_supported(), control.is_downloading())?;
    let update = control.pending()?;
    // Read before the download starts: a configuration that cannot name the key
    // is not a reason to spend half an hour transferring bytes nobody can
    // accept.
    let pubkey = updater_pubkey(&app)?;
    control.begin_download()?;

    let user_agent = format!("Enjoy/{}", app.package_info().version);
    let client = download::client(&user_agent)
        .map_err(|error| AppError::new("update.download_failed", error))?;
    let version = update.version.clone();
    let events = app.clone();
    let mut throttle = ProgressThrottle::default();
    let bytes = match download::fetch(&client, &update.download_url, |downloaded, total| {
        if throttle.should_emit(downloaded, total) {
            let _ = events.emit(
                "update-progress",
                UpdateProgress {
                    phase: "downloading".into(),
                    downloaded,
                    total,
                    version: version.clone(),
                },
            );
        }
    })
    .await
    {
        Ok(bytes) => bytes,
        Err(error) => {
            control.fail_download();
            return Err(AppError::new("update.download_failed", error));
        }
    };

    if let Err(reason) = verify::verify(&bytes, &update.signature, &pubkey) {
        control.fail_download();
        // Its own code, not the download's: the bytes arrived and are not the
        // ones that were signed, which is a different answer to give the user
        // than a connection that never finished.
        return Err(AppError::new("update.verify_failed", reason));
    }

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

/// The key a release's signature has to answer to.
///
/// Read out of the same `plugins.updater` block the plugin was initialized
/// from — the configuration compiled into this binary, not a file beside it —
/// and parsed with the plugin's own schema, so a key that the plugin would
/// refuse is refused here too.
fn updater_pubkey(app: &AppHandle) -> Result<String, AppError> {
    let section = app
        .config()
        .plugins
        .0
        .get("updater")
        .cloned()
        .ok_or_else(|| AppError::new("update.verify_failed", "no updater configuration"))?;
    let config: UpdaterConfig = serde_json::from_value(section)
        .map_err(|error| AppError::new("update.verify_failed", error))?;
    Ok(config.pubkey)
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
