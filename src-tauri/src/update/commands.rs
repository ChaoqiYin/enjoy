use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Config as UpdaterConfig, UpdaterExt};

use crate::error::AppError;
use crate::AppState;

use super::control::{
    describe, download_gate, install_gate, is_supported, ProgressThrottle, UpdateCheck,
    UpdateProgress,
};
use super::download::{Asked, Transfer};
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

/// Downloads and verifies the offered release, continuing one that was paused.
///
/// Progress goes out as `update-progress` events; how the transfer ended is
/// this call's answer. That split is deliberate — the events carry the numbers
/// because they arrive while nothing can be answered, and the ending is
/// answered because the section has to settle on exactly one of "ready",
/// "paused" or "cancelled", which is not a race it should have to win.
///
/// The transfer is this module's own rather than the plugin's, because the
/// plugin's reads its response in one pass and keeps nothing when a connection
/// ends early: on a link that drops every few seconds, a release of this size
/// could never arrive. What comes with taking it over is the signature check
/// the plugin used to do on the way out, which is why the payload is verified
/// here before anything is held.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<UpdateProgress, AppError> {
    let control = Arc::clone(&state.update);
    download_gate(is_supported(), control.is_downloading())?;
    let update = control.pending()?;
    // Read before the download starts: a configuration that cannot name the key
    // is not a reason to spend half an hour transferring bytes nobody can
    // accept.
    let pubkey = updater_pubkey(&app)?;
    let user_agent = format!("Enjoy/{}", app.package_info().version);
    // Still before anything is taken from the paused download: a client that
    // cannot be built would otherwise consume those bytes on its way out.
    let client = download::client(&user_agent)
        .map_err(|error| AppError::new("update.download_failed", error))?;
    control.begin_download()?;
    // A stop asked for before this download started — or while the last one was
    // unwinding — is not this one's business.
    control.clear_stop();
    // What a paused download arrived at. Empty when there is nothing to
    // continue, which is the same thing as starting from the beginning.
    let from = control.take_partial();

    let version = update.version.clone();
    let events = app.clone();
    let mut throttle = ProgressThrottle::default();
    let transfer = download::fetch(
        &client,
        &update.download_url,
        from,
        control.flag(),
        |downloaded, total| {
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
        },
    )
    .await;

    match transfer {
        Transfer::Complete(bytes) => {
            if let Err(reason) = verify::verify(&bytes, &update.signature, &pubkey) {
                control.end_download();
                // Its own code, not the download's: the bytes arrived and are
                // not the ones that were signed, which is a different answer to
                // give the user than a connection that never finished.
                return Err(AppError::new("update.verify_failed", reason));
            }
            control.finish_download(bytes);
            Ok(ended("ready", 0, None, version))
        }
        Transfer::Stopped {
            asked,
            bytes,
            total,
        } => {
            control.end_download();
            match asked {
                Asked::Pause => {
                    // Kept, so pressing download again asks for the rest rather
                    // than fetching the whole release over — which on the link
                    // this exists for is the difference between finishing and
                    // never finishing.
                    let downloaded = bytes.len() as u64;
                    control.park_partial(bytes);
                    Ok(ended("paused", downloaded, total, version))
                }
                Asked::Cancel => {
                    // Dropped, and dropped here rather than left for the next
                    // download: bytes are only worth resuming if nobody said to
                    // throw them away, and the user just did.
                    control.park_partial(Vec::new());
                    Ok(ended("cancelled", 0, None, version))
                }
            }
        }
        Transfer::Failed { error, bytes } => {
            control.end_download();
            // Kept rather than dropped, so pressing download again carries on
            // from here. A failure on this link is expected rather than
            // exceptional, and starting from nothing each time is what would
            // make a release of this size unreachable.
            control.park_partial(bytes);
            Err(AppError::new("update.download_failed", error))
        }
    }
}

/// The ending, in the shape the progress events already carry, so the section
/// reads one type for the numbers and for the outcome.
fn ended(phase: &str, downloaded: u64, total: Option<u64>, version: String) -> UpdateProgress {
    UpdateProgress {
        phase: phase.into(),
        downloaded,
        total,
        version,
    }
}

/// Pauses or cancels the download that is running.
///
/// Named the way the scan's control command is, and for the same reason: the
/// frontend names the action, and an unknown name is refused rather than
/// ignored, so a typo is a failure a test can see instead of a button that
/// silently does nothing. Continuing is not one of these — it is
/// `install_update` again, which is where the gate, the key and the progress
/// reporting already are.
#[tauri::command]
pub fn control_update(action: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state.update.action(&action)
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
