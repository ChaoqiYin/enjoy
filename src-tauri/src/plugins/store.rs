//! Where plugins live on disk: what is installed, which of them the user has
//! switched on, and what the kernel does to that.
//!
//! A plugin is a directory under `$APPDATA/plugins/`, beside the database and
//! found the same way the thumbnail cache is — from the database's own path
//! rather than from a constant (`crate::app::plugin_store`). Its name is its
//! id, and `plugin.json` inside it says the rest ([`super::manifest`]).
//!
//! Three rules shape this file:
//!
//! - **A plugin that does not validate is listed, not dropped.** Every check
//!   that refuses a manifest is a [`Problem`] carried on the row, so the plugin
//!   page can show what is there and why it is not running. The one exception
//!   is a plugin that cannot be read *at all* — that is still a row, keyed by
//!   the directory's name, which is the only thing about it that is known.
//! - **Nothing runs unless the user said so.** The enable record names the
//!   plugins that are on; a record that is not there means none of them are.
//!   That default is what makes safe mode possible at all: putting the record
//!   aside is the whole of it ([`Store::set_aside`]), and it is why the record
//!   names what is *on* rather than what is off.
//! - **The record is a preference, not a gate.** Switching on a plugin whose
//!   manifest did not validate is allowed and writes the record; the row still
//!   says the plugin failed, because that is a fact about the plugin and not
//!   about what the user would like. Fix the manifest and it runs.
//!
//! What this file does not do is load anything. Which plugins the *running*
//! window is asking is [`super::PluginHost`]'s, and installing, switching and
//! uninstalling all take effect on the next start (spec #82, 「不做热插拔」) —
//! so what a lifecycle command answers with is the state of the disk, and the
//! page says so rather than pretending otherwise.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::repository::Repository;

use super::archive;
use super::manifest::{self, Manifest, Problem};

/// The file the plugins that are switched on are written down in.
pub(crate) const RECORD: &str = "enabled.json";

/// One plugin's directory on disk, and everything the page needs about it.
///
/// This is the bootstrap graph: which plugins there are, which the user
/// switched on, and where each one's interface lives. A plugin with no
/// interface — a body-only one, which is what the cover fetcher is — has no
/// `entry` and is still a row.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginBootstrap {
    pub id: String,
    /// The name the plugin gives itself, or its id when the manifest did not
    /// get far enough to give one.
    pub name: String,
    pub author: String,
    /// The capabilities the manifest declares — what the user is told before
    /// they let the plugin in.
    pub capabilities: Vec<String>,
    /// The interface's entry, as the absolute path the window loads it from.
    pub entry: Option<String>,
    /// Whether the plugin declares a body half. The runtime that would run one
    /// is #87's; this says only that the plugin has one to run.
    pub has_body: bool,
    pub enabled: bool,
    /// Set when the kernel would not accept the plugin at all.
    pub failure: Option<PluginFailure>,
}

/// A failure in the kernel's error protocol, as it crosses to the interface.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginFailure {
    pub code: String,
    pub params: std::collections::BTreeMap<String, String>,
}

impl From<Problem> for PluginFailure {
    fn from(problem: Problem) -> Self {
        Self {
            code: problem.code.to_string(),
            params: problem
                .params
                .into_iter()
                .map(|(key, value)| (key.to_string(), value))
                .collect(),
        }
    }
}

/// What the user is shown before a plugin is copied in.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallPreview {
    /// Where the plugin's directory will be. The user does not know where
    /// plugins live, which is the reason for the whole pre-flight.
    pub destination: String,
    pub plugin: PluginBootstrap,
}

/// The plugins directory, and the enable record in it.
pub(crate) struct Store {
    directory: PathBuf,
}

impl Store {
    pub(crate) fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    /// Every installed plugin, by id.
    ///
    /// Ids are what the list is ordered by, and that is a decision rather than
    /// an oversight: the user's own order is [`super::PluginHost::reorder`]'s
    /// and belongs to the running window, while this is a directory listing
    /// read in a way that does not change between two runs.
    pub(crate) fn list(&self) -> Result<Vec<PluginBootstrap>, AppError> {
        let enabled = self.enabled()?;
        let mut plugins: Vec<PluginBootstrap> = self
            .installed()?
            .into_iter()
            .map(|(id, directory)| self.row(&id, &directory, enabled.contains(&id)))
            .collect();
        plugins.sort_by(|left, right| left.id.cmp(&right.id));
        Ok(plugins)
    }

    /// Switches one plugin on or off, and answers with the list as it now
    /// stands.
    ///
    /// Off means the kernel will not ask it on the next start; it does not mean
    /// the plugin's content goes anywhere. What a plugin wrote stays where it
    /// is, and comes back with the plugin — that is the whole difference
    /// between switching one off and uninstalling it.
    pub(crate) fn set_enabled(
        &self,
        id: &str,
        enabled: bool,
    ) -> Result<Vec<PluginBootstrap>, AppError> {
        self.installed_plugin(id)?;
        let mut record = self.enabled()?;
        if enabled {
            record.insert(id.to_string());
        } else {
            record.remove(id);
        }
        self.write_enabled(&record)?;
        self.list()
    }

    /// Reads a source and says what installing it would do, without doing any
    /// of it.
    pub(crate) fn preview(&self, source: &Path) -> Result<PluginInstallPreview, AppError> {
        let source = archive::read(source)?;
        let id = source.manifest.id.clone();
        let destination = self.directory.join(&id);
        Ok(PluginInstallPreview {
            plugin: self.row_of(&id, &destination, &source.manifest, true),
            destination: destination.to_string_lossy().into_owned(),
        })
    }

    /// Copies a plugin in from a directory or an archive, and switches it on.
    ///
    /// Switched on rather than left off, because installing is the user saying
    /// yes: they chose the source and saw what it declares. A directory the
    /// user copied into place themselves is the other case, and that one stays
    /// off until they say so.
    pub(crate) fn install(&self, source: &Path) -> Result<Vec<PluginBootstrap>, AppError> {
        let source = archive::read(source)?;
        let id = source.manifest.id.clone();
        let destination = self.directory.join(&id);
        if destination.exists() {
            return Err(AppError::new(
                "plugin.install.exists",
                format!("{id} is already installed"),
            )
            .with_param("plugin", &id));
        }
        archive::copy(source.directory(), &destination)?;
        let mut record = self.enabled()?;
        record.insert(id);
        self.write_enabled(&record)?;
        self.list()
    }

    /// Removes a plugin, and — only if the user said so — what it wrote.
    ///
    /// The rows are the reason this is a question: they are not the plugin's
    /// any more once it is gone, and the user is the one who knows whether the
    /// covers behind them were worth keeping.
    pub(crate) fn uninstall(
        &self,
        repository: &mut Repository,
        id: &str,
        delete_content: bool,
    ) -> Result<Vec<PluginBootstrap>, AppError> {
        let directory = self.installed_plugin(id)?;
        if delete_content {
            repository.forget_plugin_content(id)?;
        }
        fs::remove_dir_all(&directory).map_err(|error| {
            AppError::new("plugin.uninstall.failed", error)
                .with_param("plugin", id)
                .with_param("path", directory.to_string_lossy())
        })?;
        let mut record = self.enabled()?;
        record.remove(id);
        self.write_enabled(&record)?;
        self.list()
    }

    /// Puts the enable record aside, so that nothing is switched on.
    ///
    /// This is safe mode, and the whole of it: the record is renamed to a
    /// timestamped backup and the default — nothing enabled — takes over. The
    /// installed plugins are left exactly where they are, because the point is
    /// to get the application up, not to make the user install everything
    /// again. It is pure filesystem work on purpose: whatever stopped the
    /// application from starting, this must not be it.
    pub(crate) fn set_aside(&self) -> Result<Vec<PluginBootstrap>, AppError> {
        let record = self.directory.join(RECORD);
        if record.exists() {
            fs::rename(&record, self.backup_path()).map_err(|error| {
                AppError::new("plugin.safe_mode.failed", error)
                    .with_param("path", record.to_string_lossy())
            })?;
        }
        self.list()
    }

    /// The name no backup is using yet, so that two safe modes in one second do
    /// not lose the first one.
    fn backup_path(&self) -> PathBuf {
        let stamp = stamp();
        let mut candidate = self.directory.join(format!("{RECORD}.{stamp}.bak"));
        let mut attempt = 1;
        while candidate.exists() {
            candidate = self
                .directory
                .join(format!("{RECORD}.{stamp}-{attempt}.bak"));
            attempt += 1;
        }
        candidate
    }

    /// One plugin's row, as its manifest and the record have it.
    fn row(&self, id: &str, directory: &Path, enabled: bool) -> PluginBootstrap {
        match manifest::read(directory) {
            Ok(manifest) => self.row_of(id, directory, &manifest, enabled),
            Err(problem) => PluginBootstrap {
                id: id.to_string(),
                name: id.to_string(),
                author: String::new(),
                capabilities: Vec::new(),
                entry: None,
                has_body: false,
                enabled,
                failure: Some(problem.named(id).into()),
            },
        }
    }

    fn row_of(
        &self,
        id: &str,
        directory: &Path,
        manifest: &Manifest,
        enabled: bool,
    ) -> PluginBootstrap {
        PluginBootstrap {
            id: id.to_string(),
            name: manifest.name.clone(),
            author: manifest.author.clone(),
            capabilities: manifest.capabilities.clone(),
            entry: manifest
                .interface
                .as_ref()
                .map(|entry| directory.join(entry).to_string_lossy().into_owned()),
            has_body: manifest.body.is_some(),
            enabled,
            failure: None,
        }
    }

    /// The directory of one installed plugin, or the failure that names it.
    fn installed_plugin(&self, id: &str) -> Result<PathBuf, AppError> {
        let directory = self.directory.join(id);
        if id.is_empty() || !directory.is_dir() {
            return Err(
                AppError::new("plugin.not_found", format!("no plugin named {id}"))
                    .with_param("plugin", id),
            );
        }
        Ok(directory)
    }

    /// The directories in the plugins directory, by name.
    ///
    /// A directory that is not there is not an error: it is what the plugins
    /// directory looks like before the first plugin is installed, which is also
    /// what a freshly installed application starts from.
    fn installed(&self) -> Result<Vec<(String, PathBuf)>, AppError> {
        let entries = match fs::read_dir(&self.directory) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(AppError::io(error, &self.directory.to_string_lossy())),
        };
        let mut found = Vec::new();
        for entry in entries {
            let entry =
                entry.map_err(|error| AppError::io(error, &self.directory.to_string_lossy()))?;
            if !entry.path().is_dir() {
                continue;
            }
            found.push((
                entry.file_name().to_string_lossy().into_owned(),
                entry.path(),
            ));
        }
        found.sort();
        Ok(found)
    }

    /// Which plugins are switched on.
    ///
    /// A record that is not there means none of them, and a record that cannot
    /// be read means the same thing rather than an error: a plugins directory
    /// the user has been editing by hand should not be able to keep the
    /// application from showing its plugin page.
    fn enabled(&self) -> Result<BTreeSet<String>, AppError> {
        let text = match fs::read_to_string(self.directory.join(RECORD)) {
            Ok(text) => text,
            Err(_) => return Ok(BTreeSet::new()),
        };
        let record: Record = match serde_json::from_str(&text) {
            Ok(record) => record,
            Err(error) => {
                tracing::warn!(%error, "the plugin enable record could not be read; no plugin is switched on");
                return Ok(BTreeSet::new());
            }
        };
        Ok(record.enabled.into_iter().collect())
    }

    fn write_enabled(&self, enabled: &BTreeSet<String>) -> Result<(), AppError> {
        fs::create_dir_all(&self.directory).map_err(|error| {
            AppError::new("plugin.state.failed", error)
                .with_param("path", self.directory.to_string_lossy())
        })?;
        let record = Record {
            enabled: enabled.iter().cloned().collect(),
        };
        let text = serde_json::to_string_pretty(&record)
            .map_err(|error| AppError::new("plugin.state.failed", error))?;
        let path = self.directory.join(RECORD);
        fs::write(&path, text).map_err(|error| {
            AppError::new("plugin.state.failed", error).with_param("path", path.to_string_lossy())
        })
    }
}

/// What the enable record holds: the plugins that are on.
#[derive(Deserialize, Serialize)]
struct Record {
    enabled: Vec<String>,
}

/// The moment safe mode was entered, in a name every platform accepts.
///
/// Hand-formatted rather than taken from a format description, because the one
/// obvious description — RFC 3339 — carries colons, and a colon in a file name
/// is a Windows path separator. It is UTC and sorts as it reads.
fn stamp() -> String {
    let now = time::OffsetDateTime::now_utc();
    format!(
        "{:04}{:02}{:02}T{:02}{:02}{:02}Z",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second()
    )
}
