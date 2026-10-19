//! What a plugin left in the library: the fields it wrote, counted and — only
//! if the user says so — forgotten.
//!
//! `video_fields` is the one place a plugin's own work is stored (ADR 0043 §6).
//! Its `source_plugin` column is a bare string rather than a foreign key, and
//! deliberately: a plugin lives on disk and the table does not follow it there,
//! so after a plugin is uninstalled the column still answers 「这一条是谁写的」.
//! That is what makes uninstalling a question rather than a decision — the rows
//! are not the plugin's any more, and whether they go is the user's.
//!
//! Both queries are here, in one file, because they are the two halves of that
//! one question: how many rows are at stake, and taking them away.

use crate::error::AppError;

use super::Repository;

impl Repository {
    /// How many fields this plugin wrote into the library.
    pub(crate) fn plugin_content_rows(&self, plugin: &str) -> Result<i64, AppError> {
        self.connection
            .query_row(
                "SELECT COUNT(*) FROM video_fields WHERE source_plugin = ?1",
                [plugin],
                |row| row.get(0),
            )
            .map_err(AppError::from)
    }

    /// Forgets everything this plugin wrote, and answers with how many rows
    /// that was.
    ///
    /// The count is the same one the question was asked with, read again rather
    /// than carried: between the question and the answer the user may have
    /// scanned a library, and what is reported afterwards should be what
    /// actually went.
    pub(crate) fn forget_plugin_content(&mut self, plugin: &str) -> Result<usize, AppError> {
        self.connection
            .execute(
                "DELETE FROM video_fields WHERE source_plugin = ?1",
                [plugin],
            )
            .map_err(AppError::from)
    }
}

#[cfg(test)]
mod plugin_content_tests {
    use crate::repository::fixture::{self, Fixture};

    /// A library holding three fields written by two plugins.
    fn with_fields() -> Fixture {
        let fixture = Fixture::new();
        let mut library = fixture.library();
        fixture::video_fields(
            &mut library.repository,
            &[
                (1, "cover", "/a.jpg", "cover-fetcher"),
                (1, "rating", "5", "ratings"),
                (2, "cover", "/b.jpg", "cover-fetcher"),
            ],
        );
        fixture
    }

    #[test]
    fn a_plugins_rows_are_counted_and_no_others_are() {
        let fixture = with_fields();
        let repository = fixture.library().repository;

        assert_eq!(repository.plugin_content_rows("cover-fetcher").unwrap(), 2);
        assert_eq!(repository.plugin_content_rows("ratings").unwrap(), 1);
        assert_eq!(
            repository.plugin_content_rows("gone").unwrap(),
            0,
            "a plugin that wrote nothing is zero rows, which is not the same as a plugin that is not installed"
        );
    }

    #[test]
    fn forgetting_a_plugins_rows_leaves_everyone_elses() {
        let fixture = with_fields();
        let mut repository = fixture.library().repository;

        let gone = repository.forget_plugin_content("cover-fetcher").unwrap();

        assert_eq!(gone, 2);
        assert_eq!(repository.plugin_content_rows("cover-fetcher").unwrap(), 0);
        assert_eq!(
            repository.plugin_content_rows("ratings").unwrap(),
            1,
            "uninstalling one plugin does not touch what another wrote"
        );
    }
}
