use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Config as UpdaterConfig, UpdaterExt};

use crate::app::AppState;
use crate::error::AppError;

use super::control::{describe, is_supported, ProgressThrottle, UpdateCheck, UpdateProgress};
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
    let update = control.pending()?;
    // Read before the download starts: a configuration that cannot name the key
    // is not a reason to spend half an hour transferring bytes nobody can
    // accept.
    let pubkey = updater_pubkey(&app)?;
    let user_agent = format!("Enjoy/{}", app.package_info().version);
    // Built before the slot is taken, because taking it consumes the bytes a
    // paused download kept: a machine that cannot build a client would otherwise
    // eat them on its way out.
    let client = download::client(&user_agent)
        .map_err(|error| AppError::new("update.download_failed", error))?;
    // Everything the transfer needs to begin, taken in one call: the gate, the
    // slot, the last stop forgetting itself, and the bytes to continue from.
    // Whichever way the transfer ends, `slot` is what ends it.
    let slot = control.take_slot(is_supported())?;

    let version = update.version.clone();
    let events = app.clone();
    let mut throttle = ProgressThrottle::default();
    let transfer = download::fetch(
        &client,
        &update.download_url,
        slot.resume(),
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
                slot.discard();
                // Its own code, not the download's: the bytes arrived and are
                // not the ones that were signed, which is a different answer to
                // give the user than a connection that never finished. They are
                // discarded rather than kept: half a release that failed its
                // signature is not a head start on the next attempt.
                return Err(AppError::new("update.verify_failed", reason));
            }
            slot.install(bytes);
            Ok(ended("ready", 0, None, version))
        }
        Transfer::Stopped {
            asked,
            bytes,
            total,
        } => match asked {
            // Kept, so pressing download again asks for the rest rather than
            // fetching the whole release over — which on the link this exists
            // for is the difference between finishing and never finishing.
            Asked::Pause => {
                let downloaded = bytes.len() as u64;
                slot.keep(bytes);
                Ok(ended("paused", downloaded, total, version))
            }
            Asked::Cancel => {
                slot.discard();
                Ok(ended("cancelled", 0, None, version))
            }
        },
        Transfer::Failed { error, bytes } => {
            // Kept rather than dropped, so pressing download again carries on
            // from here. A failure on this link is expected rather than
            // exceptional, and starting from nothing each time is what would
            // make a release of this size unreachable.
            slot.keep(bytes);
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
/// Enjoy back. Kept synchronous because both of those expect the main thread —
/// and because the gate and the handover have to be one step: see
/// [`UpdateControl::install`], which is also where the scan slot is closed so
/// that nothing can start one in the moment before the exit.
#[tauri::command]
pub fn restart_app(state: State<'_, AppState>) -> Result<(), AppError> {
    let (update, bytes) = state.update.install(&state.scan, is_supported())?;
    update
        .install(&bytes)
        .map_err(|error| AppError::new("update.install_failed", error))
}
