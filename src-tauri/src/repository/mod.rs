//! The stored library: the connection, how it is opened, and how it is shared
//! between the threads that use it.
//!
//! The methods that read and write the library are not here. They sit in the
//! files beside this one, grouped by what they are for — [`scans`] writes back
//! what a scan found, [`videos`] answers for one record, [`spaces`] manages the
//! spaces — so a reader looking for how something is stored starts from the file
//! that names it rather than from the widest surface in the module. This file
//! holds only what all of them share: the type, the connection, and the two
//! things no caller may pass around for itself.

#[cfg(test)]
pub(crate) mod fixture;
#[cfg(test)]
mod incremental_tests;
#[cfg(test)]
mod listing_tests;
#[cfg(test)]
mod metadata_tests;
#[cfg(test)]
mod migration_tests;
mod scans;
pub(crate) mod schema;
mod spaces;
mod videos;
// Two modules about spaces, told apart by what they hold: the isolation one is
// the rule that spaces share no records (ADR 0011), the management one is
// adding, renaming and removing them.
#[cfg(test)]
mod space_isolation_tests;
#[cfg(test)]
mod space_management_tests;
#[cfg(test)]
pub(crate) mod tests;

use rusqlite::Connection;
use serde::Serialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppError;

pub use scans::DirectoryScan;

#[derive(Clone, Default, Debug, Serialize)]
pub struct IndexChanges {
    pub added: usize,
    pub updated: usize,
    pub removed: usize,
}

/// Takes the lock on a shared index, or reports the one failure that has no
/// other name.
///
/// The index is shared as `Arc<Mutex<..>>` so that long media work can hold it
/// only while it reads or writes, and turning a poisoned lock into an error is
/// the same four lines every time. They live here so that no caller has to know
/// which error a poisoned mutex becomes, and so that the four lines are written
/// once.
///
/// Every reader and writer of the index goes through this, including the two
/// outside this module — `player` and `scan::refresh`, which had each written
/// the four lines out for themselves. Until they were removed, the sentence
/// above was a claim rather than a fact: nothing but a reader's attention kept
/// a fifth copy from appearing.
pub(crate) fn lock_shared(
    shared: &std::sync::Mutex<Repository>,
) -> Result<std::sync::MutexGuard<'_, Repository>, AppError> {
    shared
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))
}

/// The verdict a path this space holds no record for gets.
///
/// Two questions reach it and two writes report it — a lookup that found no row,
/// an update that matched none, a refresh that found nothing to compare against,
/// and the play gate that asks before a window is opened — and it is one
/// verdict, so it is written once. What it must not become is a second way of
/// saying a file is missing from the disk: that one is `media.file.not_found`
/// only when the path is not in the library, and `error::AppError::io` when the
/// file system says so.
pub(crate) fn not_indexed() -> AppError {
    AppError::new("media.file.not_found", "Video is not indexed")
}

/// One application's library: the records, the configured directories they came
/// from, and the spaces those belong to.
///
/// The connection is private, so nothing outside this module reaches the schema
/// without a method that says what it is doing. The methods themselves are
/// spread over the files beside this one; see the module documentation above for
/// which holds what.
pub struct Repository {
    connection: Connection,
}

impl Repository {
    /// Opens the database, bringing it to the current schema.
    ///
    /// `first_space_name` is only read when the file has to be migrated: it is
    /// the name the whole existing library receives as it becomes the first
    /// space. Nothing is asked of it otherwise.
    pub fn open(path: &Path, first_space_name: &str) -> Result<Self, AppError> {
        let mut connection = Connection::open(path)?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        // Foreign keys stay off for the whole migration: it drops tables the
        // others reference, and the pragma cannot be flipped once a transaction
        // is open. It is turned on after the commit, where it belongs.
        let tx = connection.transaction()?;
        schema::migrate(&tx, version, first_space_name)?;
        tx.pragma_update(None, "user_version", schema::VERSION)?;
        tx.commit()?;
        connection.pragma_update(None, "foreign_keys", true)?;
        Ok(Self { connection })
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
