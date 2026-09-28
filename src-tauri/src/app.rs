use crate::error::AppError;
use crate::i18n::{language, native};
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

pub(crate) fn initialize_backend(app: &tauri::AppHandle) -> Result<(), AppError> {
    // The first space is named in the language the person is looking at right
    // now: the upgrade happens once, on a machine whose interface language is a
    // fact of that moment, and the name is theirs to change afterwards. That is
    // also why this reads the language before it opens the database.
    let language = language::current(&app.state::<language::LanguageState>())?;
    let path = database_path(app)?;
    let repository = Repository::open(&path, native::translate(&language, "defaultSpace"))?;
    app.manage(AppState {
        repository: Arc::new(Mutex::new(repository)),
        scan: Arc::new(ScanControl::default()),
        update: Arc::new(UpdateControl::default()),
        share: Arc::new(ShareControl::default()),
    });
    Ok(())
}
