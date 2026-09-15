use serde::Serialize;
use serde_json::json;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;

use crate::error::AppError;
use crate::i18n::preference;

pub struct LanguageState(pub Mutex<String>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageSettings {
    preference: String,
    language: String,
}

pub(crate) fn resolve(preference: &str, system: Option<&str>) -> String {
    match preference {
        "zh-CN" => "zh-CN".into(),
        "en" => "en".into(),
        _ => {
            let system = system.unwrap_or("en").to_ascii_lowercase();
            if system == "zh" || system.starts_with("zh-") || system.starts_with("zh_") {
                "zh-CN".into()
            } else {
                "en".into()
            }
        }
    }
}

pub fn load(app: &AppHandle) -> LanguageState {
    let stored = app
        .store("preferences.json")
        .ok()
        .and_then(|store| store.get("language"))
        .and_then(|value| value.as_str().map(str::to_owned));
    let preference = preference::normalize(stored.as_deref());
    LanguageState(Mutex::new(preference))
}

#[tauri::command]
pub fn get_language(state: State<'_, LanguageState>) -> Result<LanguageSettings, AppError> {
    let preference = state
        .0
        .lock()
        .map_err(|_| AppError::new("settings.language.failed", "Language lock poisoned"))?
        .clone();
    let language = resolve(&preference, sys_locale::get_locale().as_deref());
    Ok(LanguageSettings {
        preference,
        language,
    })
}

#[tauri::command]
pub fn set_language(
    preference: String,
    app: AppHandle,
    state: State<'_, LanguageState>,
) -> Result<LanguageSettings, AppError> {
    if !["system", "zh-CN", "en"].contains(&preference.as_str()) {
        return Err(AppError::new(
            "settings.language.invalid",
            "Invalid language preference",
        ));
    }
    let mut current = state
        .0
        .lock()
        .map_err(|_| AppError::new("settings.language.failed", "Language lock poisoned"))?;
    let store = app
        .store("preferences.json")
        .map_err(|error| AppError::new("settings.language.save_failed", error))?;
    preference::commit(&mut current, &preference, || {
        let previous = store.get("language");
        store.set("language", json!(preference));
        if let Err(error) = store.save() {
            match previous {
                Some(value) => store.set("language", value),
                None => {
                    store.delete("language");
                }
            }
            return Err(AppError::new("settings.language.save_failed", error));
        }
        Ok(())
    })?;
    Ok(LanguageSettings {
        language: resolve(&preference, sys_locale::get_locale().as_deref()),
        preference,
    })
}

#[cfg(test)]
mod tests {
    use super::resolve;

    #[test]
    fn system_resolution_and_explicit_preferences() {
        assert_eq!(resolve("system", Some("zh_TW")), "zh-CN");
        assert_eq!(resolve("system", Some("zh-Hans-CN")), "zh-CN");
        assert_eq!(resolve("system", Some("fr-FR")), "en");
        assert_eq!(resolve("system", None), "en");
        assert_eq!(resolve("en", Some("zh-CN")), "en");
        assert_eq!(resolve("zh-CN", Some("en-US")), "zh-CN");
        assert_eq!(resolve("invalid", Some("zh")), "zh-CN");
    }
}
