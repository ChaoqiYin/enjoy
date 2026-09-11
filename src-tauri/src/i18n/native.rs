use crate::error::AppError;
use crate::i18n::language::{resolve, LanguageState};
use serde_json::Value;
use std::sync::LazyLock;
use tauri::menu::{Menu, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

static ENGLISH: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../shared/locales/en/native.json"))
        .expect("Embedded English translations are valid")
});
static CHINESE: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../shared/locales/zh-CN/native.json"))
        .expect("Embedded Chinese translations are valid")
});

pub fn translate(language: &str, key: &str) -> &'static str {
    let resources = if language == "zh-CN" {
        &*CHINESE
    } else {
        &*ENGLISH
    };
    resources
        .get(key)
        .and_then(Value::as_str)
        .or_else(|| ENGLISH.get(key).and_then(Value::as_str))
        .unwrap_or("Enjoy")
}

pub fn menu(app: &AppHandle, language: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let quit = PredefinedMenuItem::quit(app, Some(translate(language, "quit")))?;
    let close = PredefinedMenuItem::close_window(app, Some(translate(language, "closeWindow")))?;
    let copy = PredefinedMenuItem::copy(app, Some(translate(language, "copy")))?;
    let paste = PredefinedMenuItem::paste(app, Some(translate(language, "paste")))?;
    let select = PredefinedMenuItem::select_all(app, Some(translate(language, "selectAll")))?;
    let application = Submenu::with_items(
        app,
        translate(language, "application"),
        true,
        &[&close, &quit],
    )?;
    let edit = Submenu::with_items(
        app,
        translate(language, "edit"),
        true,
        &[&copy, &paste, &select],
    )?;
    Menu::with_items(app, &[&application, &edit])
}

pub fn startup_failure(app: &AppHandle, error: &AppError) {
    let preference = app
        .try_state::<LanguageState>()
        .and_then(|state| state.0.lock().ok().map(|value| value.clone()))
        .unwrap_or_else(|| "system".into());
    let language = resolve(&preference, sys_locale::get_locale().as_deref());
    let message = translate(&language, "startupFailed").replace("{{id}}", &error.error_id);
    let handle = app.clone();
    let window = WebviewWindowBuilder::new(
        app,
        "startup-error",
        WebviewUrl::External("about:blank".parse().expect("Static blank URL is valid")),
    )
    .title("Enjoy")
    .inner_size(480.0, 180.0)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .build();
    let mut dialog = app
        .dialog()
        .message(message)
        .title("Enjoy")
        .kind(MessageDialogKind::Error);
    match &window {
        Ok(window) => dialog = dialog.parent(window),
        Err(error) => tracing::error!(diagnostic = %error, "Failed to create startup error window"),
    }
    dialog.show(move |_| handle.exit(1));
}

#[cfg(test)]
mod tests {
    use super::translate;

    #[test]
    fn native_templates_support_language_fallback_and_interpolation() {
        assert_eq!(translate("unsupported", "copy"), "Copy");
        assert_ne!(translate("zh-CN", "copy"), "Copy");
        assert!(translate("en", "startupFailed")
            .replace("{{id}}", "err_test")
            .contains("err_test"));
    }
}
