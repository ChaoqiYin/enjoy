//! The two preferences the settings page shows: the language the interface is
//! read in, and the theme it is drawn in.
//!
//! Both are kept by [`crate::preferences`] and neither is kept here. What is
//! here is the pair as one answer — the page reads and writes them together,
//! and saving one while refusing the other would leave the page describing an
//! interface that is not the one on screen — and the shape the seam carries.
//!
//! The rule is a plain function over the preferences and the commands are the
//! two lines that open the file, which is what lets the rule be tested without
//! a window (see `settings_tests.rs`).

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::AppError;
use crate::preferences::{store, Backing, Preference, Preferences};

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsState {
    pub language: String,
    pub theme: String,
}

/// What the settings page is shown.
pub(crate) fn read(preferences: &Preferences<impl Backing>) -> SettingsState {
    SettingsState {
        language: preferences.read(Preference::Language),
        theme: preferences.read(Preference::Theme),
    }
}

/// Keeps both, or neither. Answers with what is now in force, which is the same
/// pair — the values were checked before anything was written.
pub(crate) fn save(
    preferences: &Preferences<impl Backing>,
    settings: &SettingsState,
) -> Result<SettingsState, AppError> {
    preferences.write(&[
        (Preference::Language, &settings.language),
        (Preference::Theme, &settings.theme),
    ])?;
    Ok(settings.clone())
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<SettingsState, AppError> {
    Ok(read(&store::open(&app)?))
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: SettingsState) -> Result<SettingsState, AppError> {
    save(&store::open(&app)?, &settings)
}
