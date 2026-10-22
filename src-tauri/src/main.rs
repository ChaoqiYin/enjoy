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
// The one place in the kernel that knows plugins exist (#84). What reaches it
// so far is one command — the fields a video has (#88) — which is the order this
// work lands in rather than the whole of it: the plugin page (#85), the install
// and enable commands and the loader (#86) and the runtime (#87) arrive beside
// it. Until they do, most of the module is unreached in this binary — the tests
// beside it are what holds those rules still — so the lints that would say so
// are turned off at the one place the fact is created rather than sprinkled over
// the module. The re-exports are dead for the same reason and go with them.
#[allow(dead_code, unused_imports)]
mod plugins;
#[cfg(test)]
mod ports;
mod preferences;
mod process;
mod repository;
mod scan;
mod settings;
mod share;
mod titlebar;
mod update;

use i18n::{language, native};
use tauri::Manager;

fn main() {
    // What the titlebar is told about the window, kept across the two of them:
    // the state the interface already has, so that a resize it is standing
    // still through says nothing (`titlebar`).
    let titlebar = titlebar::Titlebar::default();
    tauri::Builder::default()
        .enable_macos_default_menu(false)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Windows 11's snap layouts, which are the one piece of this window that
        // is still the platform's. They hang on the window answering
        // `HTMAXBUTTON` for the point under the maximize button, and the button
        // is drawn in the webview — so the answer has to come from outside the
        // page, and this is what gives it (`Cargo.toml` carries the why, ADR
        // 0041 the comparison). The id is the button's in `WindowControls.tsx`,
        // which is the whole of what the two sides have to agree on.
        .plugin(
            tauri_plugin_snap_layout::init()
                .button_id("window-maximize")
                .build(),
        )
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
            commands::fields::refresh_video_fields,
            commands::fields::run_video_action,
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
            commands::plugin::list_plugins,
            commands::plugin::set_plugin_order,
            commands::plugin::set_plugin_enabled,
            commands::plugin::preview_plugin_install,
            commands::plugin::install_plugin,
            commands::plugin::uninstall_plugin,
            commands::plugin::plugin_content_rows,
            commands::plugin::run_safe_mode,
            commands::plugin_settings::list_plugin_settings,
            commands::plugin_settings::save_plugin_settings,
            commands::tasks::list_tasks,
            commands::tasks::task_action,
            commands::window::show_window,
            commands::window::close_window,
            commands::window::minimize_window,
            commands::window::toggle_maximize_window,
            commands::window::request_close_window,
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
        // Both arms are the same kind of wiring — a fact the window reports, a
        // rule from a module beside this one, and one thing said — so what is
        // left here is the part no test can do: hold Tauri's window, and read
        // its size.
        .on_window_event(move |window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // A close arriving before the backend came up — a startup that
                // failed, and said so natively — has nothing to hold it: the
                // window is the only thing left to close.
                let Some(state) = window.try_state::<app::AppState>() else {
                    return;
                };
                let events = events::AppEvents(window.app_handle().clone());
                closing::handle(&state.share, &events, || api.prevent_close());
            }
            // Every change of the window's size, which is where the state of the
            // titlebar's middle button is read. Read from the window rather than
            // from whichever command was called: the window is maximized just as
            // well by a double click on the title, by Win+Up, and by being
            // dragged to the top of the screen, and none of those is a call of
            // ours.
            tauri::WindowEvent::Resized(_) => {
                let maximized = window.is_maximized().unwrap_or(false);
                titlebar.report(maximized, &events::AppEvents(window.app_handle().clone()));
            }
            _ => {}
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
