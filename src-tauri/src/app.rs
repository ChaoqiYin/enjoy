use crate::error::AppError;
use crate::events::AppEvents;
use crate::i18n::{language, native};
use crate::plugins::{loading, settings, PluginHost, Store};
use crate::repository::Repository;
use crate::scan::control::ScanControl;
use crate::share::ShareControl;
use crate::update::UpdateControl;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;

/// What every command is handed.
///
/// It holds collaborators and no behaviour: a command that needs to do
/// something asks the module that owns that something, passing the one or two
/// things it needs out of here. Growing a method per command onto this struct
/// would rebuild the very shape this file exists to get away from — one place
/// that knows everything, where nothing can be tested without all of it.
pub(crate) struct AppState {
    pub(crate) scan: Arc<ScanControl>,
    pub(crate) repository: Arc<Mutex<Repository>>,
    pub(crate) update: Arc<UpdateControl>,
    pub(crate) share: Arc<ShareControl>,
    /// The one thing in the kernel that knows plugins exist. What reaches it is
    /// the mount points a command is about — the fields a video has, what a
    /// plugin needs the user to fill in — and nothing here knows a plugin's
    /// name. The field command reads it (#88); the install, enable and disable
    /// ones (#86) read the store beside it, and reach this one only through the
    /// interface half the host runs.
    pub(crate) plugins: Arc<PluginHost>,
    /// The plugins on disk: what is installed, which the user switched on, and
    /// what installing and uninstalling do to that. Held apart from the host
    /// because the two are read at different times and mean different things —
    /// the host is what this window is asking *now*, the store is what the next
    /// start will load.
    pub(crate) plugin_store: Arc<Store>,
    /// Where the covers a plugin found are written, which is the one directory
    /// outside the plugin's own that a plugin's answer puts a file in
    /// ([`crate::plugins::cover`]). Held here rather than asked of the
    /// application at the point of use, for the reason the store is: a command
    /// is handed the state and not an `AppHandle`, which is what makes the rule
    /// behind it reachable from a test.
    pub(crate) covers: PathBuf,
}

/// A state a test can hold. It lives here rather than beside any one test
/// because more than one module needs it, and because the recipe for building
/// one is a fact about this struct: a field added here is filled in in one
/// place, and a test written against the state keeps working.
///
/// That is the whole point of the state being a plain struct. `State<'_, AppState>`
/// is made by Tauri from a running application, so a rule that can only be
/// reached through one can only be verified in a window.
#[cfg(test)]
pub(crate) fn test_state(fixture: &crate::repository::fixture::Fixture) -> AppState {
    use crate::repository::fixture::Library;
    let Library { repository, .. } = fixture.library();
    AppState {
        scan: Arc::new(ScanControl::default()),
        repository: Arc::new(Mutex::new(repository)),
        update: Arc::new(UpdateControl::default()),
        share: Arc::new(ShareControl::default()),
        // No plugin is enabled, and none can be until there is a loader to
        // enable one (#86): a host a test holds is a host with an empty
        // rotation, which is also what the application itself starts with.
        plugins: Arc::new(PluginHost::new(
            Arc::new(crate::events::Recorded::default()),
        )),
        // Beside the fixture's own database, so that a test which installs a
        // plugin installs it into a directory that goes when the fixture does.
        plugin_store: Arc::new(Store::new(fixture.0.join("plugins"))),
        covers: fixture.0.join("covers"),
    }
}

/// Where the index lives, and the cache beside it.
///
/// Asked of the application rather than taken from a constant because the data
/// directory is the platform's answer, not this program's.
pub(crate) fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::new("media.database.path_failed", e))?;
    std::fs::create_dir_all(&directory)
        .map_err(|e| AppError::io(e, &directory.to_string_lossy()))?;
    Ok(directory.join("enjoy.db"))
}

/// The thumbnail cache, which lives beside the index and is named after it.
pub(crate) fn thumbnail_cache(database: &std::path::Path) -> PathBuf {
    database.with_file_name("thumbnails")
}

/// The plugins directory, which lives beside the index the same way and for the
/// same reason: where a plugin is installed is a fact about *this* installation
/// of the application, and the database's own path is the only thing that knows
/// it.
pub(crate) fn plugin_store(database: &std::path::Path) -> PathBuf {
    database.with_file_name("plugins")
}

/// The covers a plugin found, beside the index for the third time and the same
/// reason: they are this installation's, and the database's path is what knows
/// where this installation is.
///
/// One directory for every plugin's covers rather than one per plugin, because a
/// cover is not kept per plugin: the chain takes the first plugin that has one
/// and the field records which plugin that was, so a directory per plugin would
/// be a second copy of a fact the library already holds — and a copy that goes
/// wrong the moment the user reorders the plugins.
pub(crate) fn covers_dir(database: &std::path::Path) -> PathBuf {
    database.with_file_name("covers")
}

pub(crate) fn initialize_backend(app: &tauri::AppHandle) -> Result<(), AppError> {
    // The first space is named in the language the person is looking at right
    // now: the upgrade happens once, on a machine whose interface language is a
    // fact of that moment, and the name is theirs to change afterwards. That is
    // also why this reads the language before it opens the database.
    let language = language::current(app)?;
    let path = database_path(app)?;
    let repository = Repository::open(&path, native::translate(&language, "defaultSpace"))?;
    let plugins = Arc::new(PluginHost::new(Arc::new(AppEvents(app.clone()))));
    let plugin_store = Arc::new(Store::new(plugin_store(&path)));
    // What the user installed and switched on is put into the rotation before
    // the window is shown. It cannot fail: `loading::load` answers with nothing
    // and writes a line in the log for every plugin it could not build, so a
    // plugins directory the kernel cannot make sense of costs the user their
    // plugins and not their application (ADR 0044 §7).
    loading::load(&plugin_store, &plugins);
    // Then what the user filled in is handed to the plugins that have something
    // saved, and for the reason loading is: a plugin that works from a video's
    // menu would otherwise never see the user's settings, because the only other
    // moment the kernel hands them over is when the plugin page is open — which
    // is not where such a plugin is ever used (`plugins::settings` says the rest,
    // docs/插件系统.md §14.8). A library that cannot be read costs the user their
    // plugins' settings and not their application, the same bargain loading
    // makes with a plugins directory it cannot read.
    if let Err(error) = settings::hand_over(&plugins, &repository) {
        tracing::warn!(
            code = error.code,
            "the saved plugin settings could not be read; the plugins start without them"
        );
    }
    app.manage(AppState {
        repository: Arc::new(Mutex::new(repository)),
        scan: Arc::new(ScanControl::default()),
        update: Arc::new(UpdateControl::default()),
        share: Arc::new(ShareControl::default()),
        plugins,
        plugin_store,
        covers: covers_dir(&path),
    });
    Ok(())
}
