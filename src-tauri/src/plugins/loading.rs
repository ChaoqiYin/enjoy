//! What the running window asks: the plugins on disk, wired into the rotation.
//!
//! Everything before this file answers "what is on disk" ([`Store`]) or "how
//! does a body run" ([`super::wasm`]). Neither of them puts one in front of the
//! other, and until something does the host's rotation is empty however many
//! plugins are installed and switched on — a plugin system that has never asked
//! a plugin anything. This is that step, and it is deliberately the smallest
//! one: read the disk, keep what the four manifest checks and the enable record
//! already accepted, build each body, hand it to the host.
//!
//! # It cannot stop the application
//!
//! Nothing here returns an error, and every failure is a line in the log. The
//! reason is the one safe mode exists for (ADR 0044 §7): a plugin the kernel
//! cannot load — a manifest that stopped validating, a body that is not a wasm
//! module, a directory the user has been editing by hand — must leave the user
//! with an application, not with a window that never opens. A user whose only
//! way out of a bad plugin is to find the plugins directory is a user who has
//! been handed a file-system errand by a program.
//!
//! So a plugin that fails to load is skipped and the next one is tried, and a
//! plugins directory that cannot be read at all leaves the application starting
//! with no plugins rather than not starting. What the user is told is the
//! plugin page, which lists every directory and says which ones did not load.
//!
//! # What it reads, and what it does not
//!
//! The disk decides, not the window: this is called once, at startup, and
//! nothing re-runs it (spec #82 「不做热插拔」). Installing, switching on and
//! uninstalling all write the disk and take effect on the next start, which is
//! why the lifecycle commands answer with the state of the disk rather than with
//! what the running host holds.
//!
//! A plugin with an interface and no body is skipped here rather than being a
//! failure: its half is loaded by the window (`frontend/src/plugins/host.ts`),
//! from the entry [`Store`] hands it, and this side has nothing to build for it.

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use super::manifest;
use super::runner::Runner;
use super::wasm::WasmBody;
use super::{PluginHost, Store};

/// The directory inside a plugin's own that its `storage` capability reaches.
///
/// A directory rather than the plugin's directory itself, and that is the whole
/// of the decision: `storage_write` takes one file name and resolves it inside
/// whatever it is given, so handing it the plugin's directory would let a plugin
/// write over its own `plugin.json` — or over its own body module, which is a
/// plugin that rewrites itself on every call. One level down, `data/`, is
/// somewhere a plugin can only make a mess of its own.
pub(crate) const DATA: &str = "data";

/// Puts every plugin the user switched on into the host's rotation.
///
/// The order the plugins end up in is the user's, and it comes from the order
/// file rather than from the listing: the loop below walks the directory, which
/// is in no order in particular, and the arrangement is applied once, after it,
/// by [`PluginHost::reorder`]. Which plugin is asked first is the only place the
/// order matters — a mount point several plugins contribute to (ADR 0045 §3) —
/// and leaving it to whatever order the loop happened to walk would make it an
/// accident of the file system.
pub(crate) fn load(store: &Store, host: &PluginHost) {
    let rows = match store.list() {
        Ok(rows) => rows,
        Err(error) => {
            tracing::warn!(
                code = error.code,
                "the plugins on disk could not be read; the application starts with none of them"
            );
            return;
        }
    };
    for row in rows {
        // Three reasons a row is not asked, and none of them is worth a line in
        // the log: the user has not switched it on, the manifest did not
        // validate (the plugin page says so, with the reason), or it has no
        // body to run.
        if !row.enabled || row.failure.is_some() || !row.has_body {
            continue;
        }
        match body(store, &row.id) {
            Ok(body) => host.enable(&row.id, body),
            Err(reason) => tracing::warn!(
                plugin = %row.id,
                %reason,
                "a plugin's body could not be loaded; the application starts without it"
            ),
        }
    }
    // After the loop, not during it: what the loop built is a set of plugins the
    // kernel will ask, and this is the one place the user's arrangement is put
    // on it. An id the order names that is not in the rotation — a plugin that
    // has been uninstalled, or one that failed to load — is ignored by
    // `reorder`, which is what lets the file outlive the plugins it was written
    // against.
    host.reorder(&store.order());
}

/// One plugin's body, built from what its directory holds.
///
/// The manifest is read a second time rather than carried out of [`Store::list`]
/// because what that call answers with is a row for the page — the plugin's name,
/// its capabilities, whether it has a body — and a module's path is not one of
/// those facts. Re-reading is one file per plugin, once, at startup.
fn body(store: &Store, id: &str) -> Result<Arc<dyn Runner>, String> {
    let directory = store
        .installed_plugin(id)
        .map_err(|error| format!("{error:?}"))?;
    let manifest = manifest::read(&directory).map_err(|problem| problem.code.to_string())?;
    let entry = manifest
        .body
        .ok_or_else(|| "the plugin declares no body half".to_string())?;
    let module = fs::read(directory.join(&entry)).map_err(|error| format!("{error:?}"))?;
    let data = data_dir(&directory);
    // Made before the instance is, because `storage_write` is `fs::write` and
    // does not create the directory it writes in: a plugin whose first act is to
    // cache something would fail once and succeed from the second call on, which
    // is a bug a user would report as "sometimes".
    fs::create_dir_all(&data).map_err(|error| format!("{error:?}"))?;
    let body = WasmBody::load(id, &module, data).map_err(|error| format!("{error:?}"))?;
    Ok(body)
}

/// The one directory a plugin's `storage` capability is confined to.
pub(crate) fn data_dir(plugin: &std::path::Path) -> PathBuf {
    plugin.join(DATA)
}
