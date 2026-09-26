use rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppError;
use crate::model::Space;

use super::{now, Repository};

/// How long a space name may be, counted in characters rather than in bytes: a
/// name is as long as it reads, whatever script it is written in.
pub(crate) const NAME_MAX: usize = 24;

/// The name a space is given, as it will be stored: the user's own text with the
/// blank space around it removed.
///
/// The rules live here rather than in the dialog that happens to ask today, so
/// that creating and renaming cannot drift apart, and so that whatever asks next
/// -- an import, a command line, a test -- is held to the same verdict.
fn checked_name(raw: &str) -> Result<String, AppError> {
    let name = raw.trim();
    if name.is_empty() {
        return Err(AppError::new("space.name.empty", "Space name is empty"));
    }
    if name.chars().count() > NAME_MAX {
        return Err(
            AppError::new("space.name.too_long", "Space name is too long")
                .with_param("max", NAME_MAX),
        );
    }
    Ok(name.to_owned())
}

/// Whether another space already carries this name.
///
/// Two names that differ only in case are the same name, decided the way the
/// `spaces_name` index decides it -- both ask SQLite, both fold ASCII case --
/// so the check and the constraint it stands in front of agree. `ignore` names
/// the space being renamed, which is allowed to keep its own name.
fn taken(tx: &Connection, name: &str, ignore: Option<i64>) -> Result<bool, AppError> {
    let count: i64 = tx.query_row(
        "SELECT COUNT(*) FROM spaces WHERE name = ?1 COLLATE NOCASE AND (?2 IS NULL OR id <> ?2)",
        params![name, ignore],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn name_taken(name: &str) -> AppError {
    AppError::new("space.name.taken", "Another space has this name").with_param("name", name)
}

fn not_found() -> AppError {
    AppError::new("space.not_found", "Space does not exist")
}

impl Repository {
    /// The space the interface is showing. There is always exactly one: the
    /// schema is created with one and the last one cannot be removed.
    pub fn current_space(&self) -> Result<Space, AppError> {
        current(&self.connection)
    }

    /// Every space, oldest first, so the list the settings page shows is stable
    /// across openings rather than ordered by whichever row SQLite happens to
    /// hand back.
    pub fn spaces(&self) -> Result<Vec<Space>, AppError> {
        let mut query = self
            .connection
            .prepare("SELECT id,name FROM spaces ORDER BY created_at,id")?;
        let rows = query.query_map([], read_space)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// Adds a space and moves the interface into it, answering with it.
    ///
    /// The whole thing is one transaction: a name that turns out to be taken
    /// leaves nothing behind, and the marker is never pointing at nothing.
    pub fn create_space(&mut self, name: &str) -> Result<Space, AppError> {
        let name = checked_name(name)?;
        let tx = self.connection.transaction()?;
        if taken(&tx, &name, None)? {
            return Err(name_taken(&name));
        }
        tx.execute(
            "INSERT INTO spaces(name,created_at,current) VALUES (?1,?2,0)",
            params![name, now()],
        )?;
        let id = tx.last_insert_rowid();
        tx.execute("UPDATE spaces SET current=0 WHERE current=1", [])?;
        tx.execute("UPDATE spaces SET current=1 WHERE id=?1", [id])?;
        tx.commit()?;
        Ok(Space { id, name })
    }

    /// Gives a space a new name. Nothing else about it changes: renaming is not
    /// a move, and the records, favorites and directories all stay where they
    /// are, under the same id.
    ///
    /// The answer is the space the interface is showing afterwards -- the
    /// renamed one when it was that space, and the untouched current one when it
    /// was not.
    pub fn rename_space(&mut self, space_id: i64, name: &str) -> Result<Space, AppError> {
        let tx = self.connection.transaction()?;
        let exists: Option<i64> = tx
            .query_row("SELECT id FROM spaces WHERE id=?1", [space_id], |row| {
                row.get(0)
            })
            .optional()?;
        if exists.is_none() {
            return Err(not_found());
        }
        let name = checked_name(name)?;
        if taken(&tx, &name, Some(space_id))? {
            return Err(name_taken(&name));
        }
        tx.execute(
            "UPDATE spaces SET name=?2 WHERE id=?1",
            params![space_id, name],
        )?;
        let space = current(&tx)?;
        tx.commit()?;
        Ok(space)
    }

    /// Removes a space and everything the index held for it -- records,
    /// memberships, favorites, play history and its directory list. The video
    /// files on disk are not this application's to touch and are left alone.
    ///
    /// The space the interface shows cannot be left pointing at a row that is
    /// gone, so when the removed space was the current one the marker moves to
    /// another real space inside the same transaction.
    pub fn delete_space(&mut self, space_id: i64) -> Result<Space, AppError> {
        let tx = self.connection.transaction()?;
        // Asked before the count, so that a space that is not there is reported
        // as missing rather than as the last one standing.
        let exists: Option<i64> = tx
            .query_row("SELECT id FROM spaces WHERE id=?1", [space_id], |row| {
                row.get(0)
            })
            .optional()?;
        if exists.is_none() {
            return Err(not_found());
        }
        let total: i64 = tx.query_row("SELECT COUNT(*) FROM spaces", [], |row| row.get(0))?;
        if total <= 1 {
            return Err(AppError::new(
                "space.remove_last",
                "The last space cannot be removed",
            ));
        }
        tx.execute("DELETE FROM spaces WHERE id=?1", [space_id])?;
        // A space that was not the current one leaves the marker exactly where
        // it was. Only removing the current one asks who holds it next, and then
        // the answer is the oldest remaining space: the same choice every time,
        // rather than whatever order the table happens to hand back.
        let holder: Option<i64> = tx
            .query_row("SELECT id FROM spaces WHERE current=1", [], |row| row.get(0))
            .optional()?;
        if holder.is_none() {
            tx.execute(
                "UPDATE spaces SET current=1
                 WHERE id=(SELECT id FROM spaces ORDER BY created_at,id LIMIT 1)",
                [],
            )?;
        }
        let space = current(&tx)?;
        tx.commit()?;
        Ok(space)
    }
}

/// The one space the marker names. Read through a `Connection` rather than the
/// repository so that a mutation can ask inside its own transaction, and every
/// caller -- there, or here, or a caller of `current_space` -- reads the marker
/// the same way.
fn current(connection: &Connection) -> Result<Space, AppError> {
    connection
        .query_row("SELECT id,name FROM spaces WHERE current=1", [], read_space)
        .map_err(Into::into)
}

fn read_space(row: &rusqlite::Row<'_>) -> rusqlite::Result<Space> {
    Ok(Space {
        id: row.get(0)?,
        name: row.get(1)?,
    })
}
