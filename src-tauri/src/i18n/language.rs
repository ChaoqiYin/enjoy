use serde::Serialize;
use tauri::AppHandle;

use crate::error::AppError;
use crate::preferences::{store, Backing, Preference, Preferences};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageSettings {
    preference: String,
    language: String,
}

/// Which language a preference resolves to, on a machine whose own is `system`.
///
/// The preference is the user's answer and this is what it means here: an
/// explicit one is itself, and `system` asks the machine — anything that is
/// Chinese is the Chinese interface, and everything else is English, which is
/// the language this application is written in first.
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

/// The preference as stored, and the language it resolves to right now.
///
/// Read from the preferences on every call rather than remembered in a state of
/// its own: a copy kept here would be the one thing that falls behind a change
/// made on the settings page, and the two readers of this — the native menus,
/// and the language the 共享服务's landing page is written in — would go on
/// answering in the language the application was started with.
pub(crate) fn settings(preferences: &Preferences<impl Backing>) -> LanguageSettings {
    let preference = preferences.read(Preference::Language);
    let language = resolve(&preference, sys_locale::get_locale().as_deref());
    LanguageSettings {
        preference,
        language,
    }
}

/// The language in force right now, for native code that needs a localized
/// string without a command round trip.
pub(crate) fn current(app: &AppHandle) -> Result<String, AppError> {
    Ok(settings(&store::open(app)?).language)
}

#[tauri::command]
pub fn get_language(app: AppHandle) -> Result<LanguageSettings, AppError> {
    Ok(settings(&store::open(&app)?))
}

#[cfg(test)]
mod tests {
    use super::{resolve, settings};
    use crate::preferences::fixture::Memory;
    use crate::preferences::{Preference, Preferences};
    use crate::settings;

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

    #[test]
    fn a_language_changed_on_the_settings_page_is_the_one_in_force_after_it() {
        // The two writers of this preference used to leave the application
        // reading the language it started with — the native menus and the 共享
        // service's landing page both — until the next run. There is one writer
        // now, and this is what says so: write through the settings page, read
        // through the language the application is using.
        let preferences = Preferences::new(Memory::new());
        settings::save(
            &preferences,
            &settings::SettingsState {
                language: "zh-CN".to_string(),
                theme: "dark".to_string(),
            },
        )
        .unwrap();
        let in_force = settings(&preferences);
        assert_eq!(in_force.preference, "zh-CN");
        assert_eq!(in_force.language, "zh-CN");
        assert_eq!(preferences.read(Preference::Language), "zh-CN");
    }
}
