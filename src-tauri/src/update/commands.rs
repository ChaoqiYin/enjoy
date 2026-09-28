use tauri::{AppHandle, State};
use tauri_plugin_updater::{Config as UpdaterConfig, UpdaterExt};

use std::sync::Arc;

use crate::app::AppState;
use crate::error::AppError;
use crate::events::AppEvents;

use super::control::is_supported;
use super::release::{Release, UpdateCheck};
use super::transfer::{self, UpdateProgress};

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
    let offered = updater
        .check()
        .await
        .map_err(|error| AppError::new("update.check_failed", error))?;
    // The one place the plugin's release is wrapped, and the last place in the
    // application that names it: from here on a release is the application's own
    // type, which is what lets a test bring one of its own to the rules that act
    // on a release — including the one that throws away bytes already
    // downloaded.
    let release: Option<Arc<dyn Release>> =
        offered.map(|update| Arc::new(update) as Arc<dyn Release>);
    if let Some(release) = release.as_ref() {
        state.update.remember(Arc::clone(release));
    }
    Ok(UpdateCheck {
        supported: true,
        current_version,
        available: release.map(|release| release.describe()),
        ready_to_restart: state.update.ready_version().is_some(),
    })
}

/// Downloads and verifies the offered release, continuing one that was paused.
///
/// Pressing download happens in [`transfer::run`]; what is left here is the two
/// facts only a running application has — the signature key out of the bundled
/// configuration, and the version this build reports itself as. Both are read
/// before the transfer is entered, so a configuration that cannot name a key is
/// answered without a byte being fetched.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<UpdateProgress, AppError> {
    let pubkey = updater_pubkey(&app)?;
    let user_agent = format!("Enjoy/{}", app.package_info().version);
    transfer::run(
        &state.update,
        &pubkey,
        &user_agent,
        is_supported(),
        &AppEvents(app),
    )
    .await
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
///
/// [`UpdateControl::install`]: super::control::UpdateControl::install
#[tauri::command]
pub fn restart_app(state: State<'_, AppState>) -> Result<(), AppError> {
    let (release, bytes) = state.update.install(&state.scan, is_supported())?;
    release
        .install(&bytes)
        .map_err(|error| AppError::new("update.install_failed", error))
}
