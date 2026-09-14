use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use crate::error::AppError;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsState { pub language: String, pub theme: String }

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<SettingsState, AppError> {
 let store = app.store("preferences.json").map_err(|e| AppError::new("settings.read_failed", e))?;
 Ok(SettingsState { language: store.get("language").and_then(|v| v.as_str().map(str::to_owned)).unwrap_or_else(|| "system".into()), theme: store.get("theme").and_then(|v| v.as_str().map(str::to_owned)).unwrap_or_else(|| "system".into()) })
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: SettingsState) -> Result<SettingsState, AppError> {
 if !["system", "zh-CN", "en"].contains(&settings.language.as_str()) || !["system", "light", "dark"].contains(&settings.theme.as_str()) { return Err(AppError::new("settings.invalid", "Invalid settings")); }
 let store = app.store("preferences.json").map_err(|e| AppError::new("settings.save_failed", e))?;
 let old_l = store.get("language"); let old_t = store.get("theme");
 store.set("language", json!(&settings.language)); store.set("theme", json!(&settings.theme));
 if let Err(e) = store.save() { if let Some(v)=old_l { let _ = store.set("language",v); } else { let _ = store.delete("language"); }; if let Some(v)=old_t { let _ = store.set("theme",v); } else { let _ = store.delete("theme"); }; return Err(AppError::new("settings.save_failed",e)); }
 Ok(settings)
}
