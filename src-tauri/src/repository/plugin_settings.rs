//! What the user filled in for a plugin: the one place those values are kept.
//!
//! A plugin declares what it needs the user to fill in (`plugin.settings`, the
//! catalog's one line about it) and the kernel draws the form, checks the
//! answers and keeps them here. The plugin never writes them and cannot read
//! them: what it gets is what the kernel hands it at each call
//! (`PluginSettingsParams.values`), which is why this table is the only copy of
//! a value that exists at all.
//!
//! One table, one row per setting, keyed by the pair `(plugin_id, key)`. There
//! is no space column and no reference to follow:
//!
//! - no space, because a setting says how the plugin works rather than what is
//!   in a space — the same answer in every space, like the plugin's own data
//!   directory (docs/插件系统.md §14.7);
//! - no reference, because a plugin lives on disk and this table does not follow
//!   it there, so the column is a bare string for the reason
//!   `video_fields.source_plugin` is. What goes when a plugin is uninstalled is
//!   the uninstall path's deliberate doing, not a cascade.

use rusqlite::params;

use crate::error::AppError;
use crate::model::PluginSetting;

use super::{now, Repository};

impl Repository {
    /// What the user has filled in for one plugin, in key order.
    ///
    /// Ordered by the read rather than left to the write, because the interface
    /// draws these in the order it is given them, and an order that followed
    /// whichever field was filled in first would move a user's rows around while
    /// they changed nothing.
    pub(crate) fn plugin_settings(&self, plugin: &str) -> Result<Vec<PluginSetting>, AppError> {
        let mut query = self.connection.prepare(
            "SELECT key,value FROM plugin_settings WHERE plugin_id=?1 ORDER BY key",
        )?;
        let rows = query.query_map([plugin], |row| {
            Ok(PluginSetting {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// Writes one plugin's settings, replacing the whole of what it had.
    ///
    /// The whole of it, rather than adding to it: what is written is the form
    /// the user was looking at, and a field the plugin no longer asks for is one
    /// the user can no longer see, let alone change. Keeping such a row would
    /// leave the table holding a value nothing shows and nothing can remove.
    ///
    /// One statement per setting, all of them in one transaction: a half-written
    /// form would be a plugin handed two different answers on the next call.
    pub(crate) fn save_plugin_settings(
        &mut self,
        plugin: &str,
        values: &[PluginSetting],
    ) -> Result<(), AppError> {
        let tx = self.connection.transaction()?;
        tx.execute("DELETE FROM plugin_settings WHERE plugin_id=?1", [plugin])?;
        for setting in values {
            tx.execute(
                "INSERT INTO plugin_settings (plugin_id,key,value,updated_at) VALUES (?1,?2,?3,?4)",
                params![plugin, setting.key, setting.value, now()],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Forgets everything the user filled in for this plugin, and answers with
    /// how many settings that was.
    ///
    /// Uninstalling is the only caller, and it is not a question the user is
    /// asked: a setting belongs to the plugin the way its own data directory
    /// does, so it goes with it. What the plugin wrote *into the library* is the
    /// other half of that and is asked about separately (User Story 7) — a row
    /// about a video outlives its plugin, a value about the plugin does not.
    pub(crate) fn forget_plugin_settings(&mut self, plugin: &str) -> Result<usize, AppError> {
        self.connection
            .execute("DELETE FROM plugin_settings WHERE plugin_id=?1", [plugin])
            .map_err(Into::into)
    }
}

#[cfg(test)]
mod plugin_settings_tests {
    use crate::model::PluginSetting;
    use crate::repository::fixture::Fixture;
    use crate::repository::Repository;

    /// A form's worth of answers, as a test spells one.
    fn values(pairs: &[(&str, &str)]) -> Vec<PluginSetting> {
        pairs
            .iter()
            .map(|(key, value)| PluginSetting {
                key: (*key).to_string(),
                value: (*value).to_string(),
            })
            .collect()
    }

    /// What the library holds for one plugin, as pairs.
    fn held(repository: &Repository, plugin: &str) -> Vec<(String, String)> {
        repository
            .plugin_settings(plugin)
            .unwrap()
            .into_iter()
            .map(|setting| (setting.key, setting.value))
            .collect()
    }

    #[test]
    fn what_the_user_filled_in_comes_back_out() {
        let fixture = Fixture::new();
        let mut repository = fixture.library().repository;

        repository
            .save_plugin_settings(
                "cover-fetcher",
                &values(&[("url", "https://a.example"), ("size", "large")]),
            )
            .unwrap();

        assert_eq!(
            held(&repository, "cover-fetcher"),
            vec![
                ("size".to_string(), "large".to_string()),
                ("url".to_string(), "https://a.example".to_string()),
            ],
            "read back in key order, so a form draws the same way twice"
        );
    }

    #[test]
    fn a_plugin_that_was_never_filled_in_has_nothing() {
        let fixture = Fixture::new();
        let repository = fixture.library().repository;

        assert_eq!(held(&repository, "never-asked"), vec![]);
    }

    #[test]
    fn saving_a_plugin_replaces_what_it_had_and_leaves_others_alone() {
        let fixture = Fixture::new();
        let mut repository = fixture.library().repository;
        repository
            .save_plugin_settings("cover-fetcher", &values(&[("url", "one"), ("size", "small")]))
            .unwrap();
        repository
            .save_plugin_settings("ratings", &values(&[("scale", "5")]))
            .unwrap();

        // The second form, as the user left it: the size field is gone from the
        // declaration, and the url was changed.
        repository
            .save_plugin_settings("cover-fetcher", &values(&[("url", "two")]))
            .unwrap();

        assert_eq!(
            held(&repository, "cover-fetcher"),
            vec![("url".to_string(), "two".to_string())],
            "the whole form is what was written, not the fields that changed"
        );
        assert_eq!(
            held(&repository, "ratings"),
            vec![("scale".to_string(), "5".to_string())],
            "one plugin's form is not another's"
        );
    }

    #[test]
    fn an_empty_form_empties_the_plugin() {
        let fixture = Fixture::new();
        let mut repository = fixture.library().repository;
        repository
            .save_plugin_settings("cover-fetcher", &values(&[("url", "one")]))
            .unwrap();

        repository.save_plugin_settings("cover-fetcher", &[]).unwrap();

        assert_eq!(held(&repository, "cover-fetcher"), vec![]);
    }

    #[test]
    fn forgetting_a_plugins_settings_leaves_everyone_elses() {
        let fixture = Fixture::new();
        let mut repository = fixture.library().repository;
        repository
            .save_plugin_settings("cover-fetcher", &values(&[("url", "one"), ("size", "small")]))
            .unwrap();
        repository
            .save_plugin_settings("ratings", &values(&[("scale", "5")]))
            .unwrap();

        let gone = repository.forget_plugin_settings("cover-fetcher").unwrap();

        assert_eq!(gone, 2, "the count is what actually went");
        assert_eq!(held(&repository, "cover-fetcher"), vec![]);
        assert_eq!(
            held(&repository, "ratings"),
            vec![("scale".to_string(), "5".to_string())],
            "uninstalling one plugin does not touch what another was told"
        );
    }

    #[test]
    fn settings_are_the_same_in_every_space() {
        let fixture = Fixture::new();
        let mut repository = fixture.library().repository;
        repository
            .save_plugin_settings("cover-fetcher", &values(&[("url", "one")]))
            .unwrap();

        // Filled in with one space current, read with another: neither call
        // names a space, and the same answer comes back. That is the whole of
        // the decision — a setting says how the plugin works, not what is in a
        // space (docs/插件系统.md §14.7) — and this test is what would fail if a space
        // column were added and left to default.
        let second = repository.create_space("Second").unwrap();
        repository.switch_space(second.id).unwrap();

        assert_eq!(
            held(&repository, "cover-fetcher"),
            vec![("url".to_string(), "one".to_string())],
            "the space the interface happens to be showing does not reach this table"
        );
    }
}
