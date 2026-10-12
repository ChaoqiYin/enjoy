#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod app;
mod closing;
mod commands;
mod error;
mod events;
mod i18n;
mod logging;
mod media;
mod model;
mod player;
#[cfg(test)]
mod ports;
mod preferences;
mod process;
mod repository;
mod scan;
mod settings;
mod share;
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
            commands::library::set_shared,
            commands::library::open_video,
            commands::share::open_share,
            commands::share::close_share,
            commands::share::share_status,
            commands::share::regenerate_share_password,
            commands::space::current_space,
            commands::space::list_spaces,
            commands::space::create_space,
            commands::space::rename_space,
            commands::space::delete_space,
            commands::space::switch_space,
            commands::window::show_window,
            commands::window::close_window,
            update::commands::check_for_update,
            update::commands::install_update,
            update::commands::control_update,
            update::commands::restart_app
        ])
        // What a close means is decided here rather than in the interface: a
        // close is held only while a 共享服务 is running, and the backend is the
        // one that knows whether one is (`closing`). The interface is asked
        // nothing about its own window, and it is told a close is being held the
        // same way it is told everything else.
        //
        // This is the whole of the wiring: the decision, the holding and the
        // telling are one call, so what is left here is the one thing no test can
        // do — hold Tauri's window.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // A close arriving before the backend came up — a startup that
                // failed, and said so natively — has nothing to hold it: the
                // window is the only thing left to close.
                let Some(state) = window.try_state::<app::AppState>() else {
                    return;
                };
                let events = events::AppEvents(window.app_handle().clone());
                closing::handle(&state.share, &events, || api.prevent_close());
            }
        })
        .setup(|app| {
            // First, so that a failure below is written down. The log file
            // needs the application data folder, which only exists once there
            // is an application to ask, so this cannot happen any earlier.
            logging::init(app.handle());
            // The window is created hidden (`tauri.conf.json`) and is not shown
            // here. It is shown by the interface asking, once React has committed
            // what will be on it (`commands::window::show_window`) — so there is
            // no window period for a startup picture to cover, and the first
            // visible frame is the interface itself.
            //
            // What that costs is the other half of the arrangement: a frontend
            // that never comes up leaves a process with no window at all, and
            // nothing puts one on screen. Deliberate, and recorded in ADR 0037
            // §四. A backend that fails to come up is still reported on screen,
            // because that report does not need this window (`i18n::native`).
            if let Err(error) = app::initialize_backend(app.handle()) {
                native::startup_failure(app.handle(), &error);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            tracing::error!(diagnostic = %error, "Application runtime failed");
        });
}
