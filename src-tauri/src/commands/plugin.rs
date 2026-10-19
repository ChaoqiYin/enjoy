//! The plugin page's commands: what is installed, and what the user may do
//! about it.
//!
//! Every one of these answers with the list as it now stands, the way the space
//! commands answer with the space to show afterwards: a lifecycle action
//! changes what the page lists, and a caller that had to ask again could draw
//! the two contradicting each other.
//!
//! None of them reaches [`crate::plugins::PluginHost`]. What this window is
//! asking right now is the host's, and installing, switching and uninstalling
//! take effect on the next start (spec #82, 「不做热插拔」) — so what these
//! answer with is the state of the disk, and the page says so rather than
//! pretending the change is already in force.

use std::path::PathBuf;

use tauri::State;

use crate::app::AppState;
use crate::error::AppError;
use crate::plugins::{PluginBootstrap, PluginInstallPreview};
use crate::repository::lock_shared;

/// Every installed plugin, in the order the user arranged them.
///
/// The order is what decides who is asked first at a mount point several
/// plugins contribute to (ADR 0045 §3), so it is part of what a row is and not
/// a way of drawing the page: this answers with the same order the kernel will
/// ask them in on the next start.
#[tauri::command]
pub(crate) fn list_plugins(state: State<'_, AppState>) -> Result<Vec<PluginBootstrap>, AppError> {
    state.plugin_store.ordered()
}

/// Writes down the order the user arranged the plugins in.
///
/// Reading the current order is [`list_plugins`]: it is already the arrangement,
/// and a second command that answered the same list would be a second name for
/// one fact. Like every other lifecycle command this one takes effect on the
/// next start (spec #82, 「不做热插拔」) — what changes now is what the page
/// draws, not what this window is asking.
#[tauri::command]
pub(crate) fn set_plugin_order(
    state: State<'_, AppState>,
    order: Vec<String>,
) -> Result<Vec<PluginBootstrap>, AppError> {
    state.plugin_store.set_order(&order)
}

/// Switches one plugin on or off.
///
/// Switching one off leaves everything it brought where it is — its own
/// directory, and the fields it wrote into the library. That is the whole
/// difference between switching a plugin off and uninstalling it.
#[tauri::command]
pub(crate) fn set_plugin_enabled(
    state: State<'_, AppState>,
    plugin_id: String,
    enabled: bool,
) -> Result<Vec<PluginBootstrap>, AppError> {
    state.plugin_store.set_enabled(&plugin_id, enabled)
}

/// Says what installing this source would do, without doing any of it.
///
/// This is the pre-flight: where the plugin would land, what it declares, and
/// which halves it has — everything the user needs to refuse it before it is
/// copied in.
#[tauri::command]
pub(crate) fn preview_plugin_install(
    state: State<'_, AppState>,
    source: String,
) -> Result<PluginInstallPreview, AppError> {
    state.plugin_store.preview(&PathBuf::from(source))
}

#[tauri::command]
pub(crate) fn install_plugin(
    state: State<'_, AppState>,
    source: String,
) -> Result<Vec<PluginBootstrap>, AppError> {
    state.plugin_store.install(&PathBuf::from(source))
}

/// Removes a plugin, and what it wrote only if the user said so.
#[tauri::command]
pub(crate) fn uninstall_plugin(
    state: State<'_, AppState>,
    plugin_id: String,
    delete_content: bool,
) -> Result<Vec<PluginBootstrap>, AppError> {
    let mut repository = lock_shared(&state.repository)?;
    state
        .plugin_store
        .uninstall(&mut repository, &plugin_id, delete_content)
}

/// How many rows of the library this plugin wrote, for the question the user is
/// asked before any of them go.
#[tauri::command]
pub(crate) fn plugin_content_rows(
    state: State<'_, AppState>,
    plugin_id: String,
) -> Result<i64, AppError> {
    lock_shared(&state.repository)?.plugin_content_rows(&plugin_id)
}

/// Starts the application without any plugin, by putting the enable record
/// aside.
#[tauri::command]
pub(crate) fn run_safe_mode(state: State<'_, AppState>) -> Result<Vec<PluginBootstrap>, AppError> {
    state.plugin_store.set_aside()
}
