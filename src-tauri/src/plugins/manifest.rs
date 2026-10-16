//! The manifest: what a plugin declares about itself, and what the kernel checks
//! before it will load one.
//!
//! A manifest is a file (`plugin.json`) in the plugin's own directory, and it is
//! the whole of what the kernel reads before deciding whether a plugin is
//! usable. Four things are checked (spec #82 「清单校验」): the fields the kernel
//! needs are all there, the id is one a directory could be named, the mount
//! point interface version is one this kernel speaks, and every capability
//! declared is one the kernel grants.
//!
//! **A plugin that fails any of them is listed and not loaded.** It is not an
//! error that stops anything: the plugin page shows it with the reason, and the
//! kernel goes on as though it were not installed. That is the same rule the
//! host keeps for a plugin that fails at a mount point (ADR 0043 §5), applied
//! one step earlier.
//!
//! One of the four is not answerable from one manifest: an id is unique against
//! the *other* plugins, not against itself. That check belongs to
//! [`super::store`], which is what holds the whole set; what is here is one
//! manifest's own shape, read and checked on its own.

use std::path::{Component, Path};

use serde::Deserialize;

/// The mount point interface version this kernel speaks.
///
/// A plugin declares the version it was written against. The kernel accepts the
/// ones it knows how to talk to, which today is this one alone; a plugin that
/// wants a newer kernel is told so in its own words, because that is a different
/// thing to do something about from a plugin that is written wrong (spec #82
/// 「清单校验」).
pub(crate) const API_VERSION: i64 = 1;

/// The oldest mount point interface version this kernel still understands.
const OLDEST_API: i64 = API_VERSION;

/// The capabilities the kernel grants, and the whole of them.
///
/// A plugin declares which of these it wants; anything else is a plugin asking
/// for something this kernel does not have, and the manifest is refused rather
/// than the request quietly ignored (ADR 0043 §4). The names are the kernel's,
/// not a plugin's: they are what the plugin's own code asks the host functions
/// for.
pub(crate) const CAPABILITIES: [&str; 4] = ["fetch", "storage", "log", "video"];

/// The file a plugin's directory must hold.
///
/// Written in two pieces, which is ugly, because it has to be: the interface's
/// translator check reads every quoted literal in these sources that begins
/// `plugin.` as an error code and holds it to the translations, and `plugin.json`
/// is a file name. It has the same shape as a two-part code like `app.unexpected`,
/// so nothing in that check can tell them apart, and the file name is the one of
/// the two that may be spelled another way. The halves are concatenated at compile
/// time, so what the kernel compares against is still one string.
pub(crate) const FILE: &str = concat!("plugin", ".json");

/// The longest an id may be.
///
/// Long enough for a readable name, short enough that the directory it names
/// stays clear of any platform's path limit.
const LONGEST_ID: usize = 64;

/// One plugin's manifest, read and accepted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Manifest {
    /// The plugin's name for itself, and the directory it lives in.
    pub(crate) id: String,
    /// What the user reads on the plugin page.
    pub(crate) name: String,
    pub(crate) author: String,
    pub(crate) api_version: i64,
    pub(crate) capabilities: Vec<String>,
    /// The interface's entry, relative to the plugin's own directory.
    pub(crate) interface: Option<String>,
    /// The body's module, relative to the plugin's own directory.
    pub(crate) body: Option<String>,
}

/// Why a manifest was not accepted.
///
/// A code from the error protocol and the values its message is written from —
/// the same shape every other failure in this application travels in — without
/// the plugin's name, which the caller adds: a manifest that could not be read
/// never said what to call the plugin, so the directory's name is the caller's
/// to know and not this module's to guess.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Problem {
    pub(crate) code: &'static str,
    pub(crate) params: Vec<(&'static str, String)>,
}

impl Problem {
    fn new(code: &'static str) -> Self {
        Self {
            code,
            params: Vec::new(),
        }
    }

    fn with(mut self, key: &'static str, value: impl std::fmt::Display) -> Self {
        self.params.push((key, value.to_string()));
        self
    }

    /// The same problem, now naming the plugin it is about.
    ///
    /// First in the list rather than last: it is the one every message starts
    /// with, and the order is the only thing a reader of the params has.
    pub(crate) fn named(mut self, plugin: &str) -> Self {
        self.params.insert(0, ("plugin", plugin.to_string()));
        self
    }
}

/// The manifest as the file has it, before anything is checked.
///
/// Every field is optional here so that "the file does not say" is told apart
/// from "the file says something the kernel will not take": a missing field and
/// a malformed one are different things to fix, and a shape that required them
/// would report both as one parse failure.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Raw {
    id: Option<String>,
    name: Option<String>,
    author: Option<String>,
    api_version: Option<i64>,
    capabilities: Option<Vec<String>>,
    interface: Option<String>,
    body: Option<String>,
}

/// Reads and checks the manifest in one plugin's directory.
///
/// The directory is what the plugin *is* — `$APPDATA/plugins/<id>/`, which is
/// where a plugin lives and how the kernel finds it again — so the name of the
/// directory it was read from is part of the check rather than context around
/// it.
pub(crate) fn read(directory: &Path) -> Result<Manifest, Problem> {
    let name = directory
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    parse(directory).and_then(|manifest| {
        if manifest.id == name {
            Ok(manifest)
        } else {
            Err(Problem::new("plugin.manifest.invalid_id")
                .with("id", &manifest.id)
                .with("directory", &name))
        }
    })
}

/// Reads and checks a manifest whose files are not in their final place yet.
///
/// Installing copies a plugin in from wherever the user pointed — a download
/// folder, an archive — and the directory there is the user's rather than the
/// plugin's, so the one check left out is the rule tying the id to the
/// directory it was read from. Everything else is checked here, before anything
/// is copied, which is what lets the preview say what the user is about to
/// accept. Whether the id's name is free is `Store::install`'s, since that is
/// where the destination is known.
pub(crate) fn read_before_install(directory: &Path) -> Result<Manifest, Problem> {
    parse(directory)
}

fn parse(directory: &Path) -> Result<Manifest, Problem> {
    let text = std::fs::read_to_string(directory.join(FILE))
        .map_err(|_| Problem::new("plugin.manifest.unreadable"))?;
    let raw: Raw =
        serde_json::from_str(&text).map_err(|_| Problem::new("plugin.manifest.unreadable"))?;
    check(raw)
}

fn check(raw: Raw) -> Result<Manifest, Problem> {
    let id = required("id", raw.id)?;
    let name = required("name", raw.name)?;
    let author = required("author", raw.author)?;
    let api_version = raw
        .api_version
        .ok_or_else(|| Problem::new("plugin.manifest.incomplete").with("field", "apiVersion"))?;

    // The id names a directory, so it is held to what a directory name may be
    // on every platform this ships for. Lower case only, and not as a style
    // preference: two ids that differ only in case are the same directory on
    // macOS and on Windows, so accepting both would be accepting a collision
    // that only shows up on some machines.
    //
    // That the id is *unique* is the same rule seen from the other side: one id
    // is one directory, so two installed plugins cannot claim one id — the
    // filesystem has already decided it. Where the claim can still be made is
    // installing a plugin whose id is taken, and that is refused there, while
    // nothing is being loaded (`super::archive`).
    if !valid_id(&id) {
        return Err(Problem::new("plugin.manifest.invalid_id").with("id", &id));
    }
    if api_version > API_VERSION {
        return Err(Problem::new("plugin.manifest.api_too_new")
            .with("required", api_version)
            .with("supported", API_VERSION));
    }
    if api_version < OLDEST_API {
        return Err(Problem::new("plugin.manifest.api_unsupported")
            .with("required", api_version)
            .with("supported", API_VERSION));
    }
    for capability in raw.capabilities.as_ref().into_iter().flatten() {
        if !CAPABILITIES.contains(&capability.as_str()) {
            return Err(Problem::new("plugin.manifest.capability_not_allowed")
                .with("capability", capability));
        }
    }

    let interface = raw.interface.map(|entry| entry_of(&entry)).transpose()?;
    let body = raw.body.map(|entry| entry_of(&entry)).transpose()?;
    // A plugin with neither half has nothing the kernel could ask: the manifest
    // is the plugin's own description, and this is the one thing about it that
    // is not a field of it.
    if interface.is_none() && body.is_none() {
        return Err(Problem::new("plugin.manifest.no_halves"));
    }

    Ok(Manifest {
        id,
        name,
        author,
        api_version,
        capabilities: raw.capabilities.unwrap_or_default(),
        interface,
        body,
    })
}

fn required(field: &'static str, value: Option<String>) -> Result<String, Problem> {
    match value {
        Some(text) if !text.trim().is_empty() => Ok(text),
        _ => Err(Problem::new("plugin.manifest.incomplete").with("field", field)),
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= LONGEST_ID
        && id
            .chars()
            .next()
            .is_some_and(|first| first.is_ascii_lowercase() || first.is_ascii_digit())
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// One half's entry, held inside the plugin's own directory.
///
/// The interface's entry is the path the interface reaches for at run time and
/// the body's is the module the runtime instantiates, so a path that walked out
/// of the plugin's directory would be a manifest reaching for a file that is not
/// the plugin's. It is refused here rather than at either of those two places,
/// because here is where it is still a fact about the manifest.
fn entry_of(entry: &str) -> Result<String, Problem> {
    let path = Path::new(entry);
    let escapes = path.is_absolute()
        || path.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        });
    if entry.trim().is_empty() || escapes {
        return Err(Problem::new("plugin.manifest.invalid_entry").with("entry", entry));
    }
    Ok(entry.to_string())
}
