//! The two commands behind the plugin page's settings form: what the plugins
//! need filled in, and what the user filled in.
//!
//! One module rather than two, because they are the two halves of one form: the
//! page draws what it is given, the user changes it, and the answer to saving is
//! the same shape as the answer to reading — so a page that redraws from the
//! answer never has to work out what changed (the rule every plugin command
//! follows).
//!
//! Two rules of the plugin system meet here and are worth naming, because both
//! are the reason the code is shaped the way it is:
//!
//! - **The index is let go of before a plugin is asked.** The repository is
//!   shared with the scan and the media pass, and a plugin is somebody else's
//!   code: holding the lock across a call would let a slow plugin stop a scan
//!   (ADR 0043 §2, and `commands::fields` says the same about the same lock).
//! - **The space travels with every call.** A plugin's settings are global
//!   (baseline §14.7) and the command still names the space, because that is
//!   what every mount point is called with (ADR 0012): a plugin is shown a
//!   space's data, and what it asks the user for may well depend on which space
//!   is on screen.

use tauri::State;

use crate::app::AppState;
use crate::error::AppError;
use crate::plugins::mount_points::{SettingValue, SpaceRef};
use crate::plugins::settings;
use crate::plugins::{saved_for, PluginSettingsGroup};
use crate::repository::lock_shared;

/// What every plugin needs the user to fill in, with what the user has.
///
/// Takes the state rather than a `State<AppState>` so that the rules here are
/// reachable from a test; the command below is the only production caller.
pub(crate) fn settings(
    state: &AppState,
    space_id: i64,
) -> Result<Vec<PluginSettingsGroup>, AppError> {
    let saved = {
        let repository = lock_shared(&state.repository)?;
        settings::saved(&repository, &state.plugins.enabled())?
    };
    Ok(state
        .plugins
        .plugin_settings(&SpaceRef { id: space_id }, &saved)
        .into_iter()
        .map(|group| {
            let values = saved_for(&saved, &group.plugin);
            settings::group(group, values)
        })
        .collect())
}

/// Checks one plugin's filled-in form and saves it, answering with every group
/// as it now stands.
///
/// The declaration the form is checked against is the one the plugin gives for
/// the values **it has been handed**, not for the values that just arrived: the
/// plugin answers a question, and the question it was asked was about the form
/// the user was looking at. Asking it with the new values instead would check
/// the user's answers against a declaration that was drawn for a different set
/// of them.
///
/// A plugin the host is not asking is refused rather than saved. Nothing else
/// here can be: the values are the kernel's to keep, and a plugin that is
/// switched off or out of the rotation has not been asked anything — saving
/// would leave the library holding answers to a question nobody put.
pub(crate) fn save(
    state: &AppState,
    space_id: i64,
    plugin: &str,
    submitted: &[SettingValue],
) -> Result<Vec<PluginSettingsGroup>, AppError> {
    let space = SpaceRef { id: space_id };
    let current = lock_shared(&state.repository)?.plugin_settings(plugin)?;
    let Some(fields) = state.plugins.plugin_settings_for(plugin, &space, &current) else {
        return Err(AppError::new(
            "plugin.settings.unavailable",
            format!("{plugin} is not running, so it cannot be asked what it needs"),
        )
        .with_param("plugin", plugin));
    };
    let values = settings::check(plugin, &fields, submitted)?;
    lock_shared(&state.repository)?.save_plugin_settings(plugin, &values)?;
    // Every group as it now stands, the way every command that changes something
    // answers. The second question is also the hand-over: asking a plugin what
    // it needs is how it is given what the user filled in, so the plugin that
    // was just saved receives it here, in the same call that redraws the page
    // (baseline §14.8).
    settings(state, space_id)
}

#[tauri::command]
pub(crate) fn list_plugin_settings(
    state: State<'_, AppState>,
    space_id: i64,
) -> Result<Vec<PluginSettingsGroup>, AppError> {
    settings(&state, space_id)
}

#[tauri::command]
pub(crate) fn save_plugin_settings(
    state: State<'_, AppState>,
    space_id: i64,
    plugin_id: String,
    values: Vec<SettingValue>,
) -> Result<Vec<PluginSettingsGroup>, AppError> {
    save(&state, space_id, &plugin_id, &values)
}
