#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod app;
mod commands;
mod error;
mod events;
mod i18n;
mod logging;
mod media;
mod model;
mod player;
mod process;
mod repository;
mod scan;
mod settings;
mod update;

use i18n::{language, native};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .enable_macos_default_menu(false)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            language::get_language,
            language::set_language,
            settings::get_settings,
            settings::save_settings,
            commands::scan::regenerate_thumbnails,
            commands::scan::scan_action,
            commands::scan::scan_status,
            commands::scan::rescan_directories,
            commands::scan::refresh_video_info,
            commands::library::list_videos,
            commands::library::list_directories,
            commands::library::remove_video,
            commands::library::remove_directory,
            commands::library::add_directory,
            commands::library::set_favorite,
            commands::library::open_video,
            commands::space::current_space,
            commands::space::list_spaces,
            commands::space::create_space,
            commands::space::rename_space,
            commands::space::delete_space,
            commands::space::switch_space,
            update::commands::check_for_update,
            update::commands::install_update,
            update::commands::control_update,
            update::commands::restart_app
        ])
        .setup(|app| {
            // First, so that a failure below is written down. The log file
            // needs the application data folder, which only exists once there
            // is an application to ask, so this cannot happen any earlier.
            logging::init(app.handle());
            app.manage(language::load(app.handle()));
            let result = app::initialize_backend(app.handle());
            if let Err(error) = result {
                native::startup_failure(app.handle(), &error);
                return Ok(());
            }
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window.show() {
                    let error = error::AppError::new("app.startup.failed", error);
                    native::startup_failure(app.handle(), &error);
                }
                // macOS gives a WKWebView no context-menu entry for the Web
                // inspector, and this app turns the default menu bar off, so a
                // debug build would otherwise have no way to open one. The call
                // itself only exists under `debug_assertions` (or the `devtools`
                // feature), so release builds are unchanged.
                #[cfg(debug_assertions)]
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            tracing::error!(diagnostic = %error, "Application runtime failed");
        });
}
