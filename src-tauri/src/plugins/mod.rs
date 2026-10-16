//! The plugin host: the one place in the kernel that knows plugins exist.
//!
//! Everything else in the kernel asks this, and asks nothing else about
//! plugins: a flow that has something a plugin might want hands it over here
//! and is handed back what the plugins said. No kernel code names a plugin, and
//! none of it can be made to wait on one — a mount call answers, whatever the
//! plugins did.
//!
//! Three rules are the whole of the host:
//!
//! - **A plugin can only add** (ADR 0043 §2). A mount call hands back
//!   contributions. There is no way for a plugin to remove, replace, block or
//!   veto anything the kernel does, and no mount method returns an error.
//! - **A failure is not an event** (ADR 0043 §5). A body that throws, is
//!   interrupted, or answers something the kernel cannot read has said nothing:
//!   this call goes on without it, the kernel goes on, and the user gets one
//!   notification naming the plugin and the mount point. Five failed calls take
//!   the plugin out of the rotation, because the alternative is a notification
//!   per render.
//! - **The catalog is the one copy of the mount points** (ADR 0045 §6). The
//!   keys, the params and the results all come out of [`mount_points`], which
//!   is generated from `shared/plugins/mount-points.json`.
//!
//! The files beside this one hold one responsibility each: [`registry`] who is
//! asked and in what order, [`dispatch`] the mount points themselves,
//! [`metrics`] what each call cost, [`runner`] the port a plugin's working half
//! is reached through. This file holds only what they share: the type, its two
//! locks, and the order a call is written down in.
//!
//! Where a call's interruption comes from: not here. The host keeps no deadline
//! of its own and starts no thread per call, so a call comes back only because
//! the port made it come back — [`Runner`]'s docs are that contract, and coming
//! back is the implementor's obligation rather than something this module
//! backstops (ADR 0044 §2, §4, §5). What the host owes is what happens after,
//! and it is the same for a call that failed and a call that ran past its
//! deadline: the call said nothing.

mod archive;
mod dispatch;
mod manifest;
mod metrics;
mod order;
mod registry;
mod runner;
mod store;
mod wasm;

#[cfg(test)]
mod cover_tests;
#[cfg(test)]
mod dispatch_tests;
#[cfg(test)]
mod escape_tests;
#[cfg(test)]
mod failure_tests;
#[cfg(test)]
pub(crate) mod fixture;
#[cfg(test)]
mod loading_tests;
#[cfg(test)]
mod manifest_tests;
#[cfg(test)]
mod metrics_tests;
#[cfg(test)]
mod order_tests;
#[cfg(test)]
mod settings_tests;
#[cfg(test)]
mod store_install_tests;
#[cfg(test)]
mod store_tests;

// The catalog is generated (`npm run generate:plugins`, held in place by
// `npm run check`) because the six mount points are also written down in the
// interface's types and in the page a plugin author reads; `mount_points.rs`
// says where it comes from. Part of what it declares is for the interface half
// rather than this one — the two interface mount points and their params — so
// the module holds more than the host reads.
pub(crate) mod mount_points;

// The three the rest of the kernel reaches for rather than through: `loading` is
// what the application calls once at startup to put the plugins on disk into the
// rotation, `settings` is what it calls right after to hand each of them what the
// user filled in, and `cover` is what a field command calls for the one field
// name the kernel knows. All three are the kernel's own work around the host
// rather than anything a plugin is asked.
pub(crate) mod cover;
pub(crate) mod loading;
pub(crate) mod settings;

pub(crate) use dispatch::{saved_for, PluginSettings};
pub(crate) use metrics::{CallOutcome, CallRecord};
pub(crate) use runner::{Runner, RunnerError};
pub(crate) use settings::{PluginSettingField, PluginSettingsGroup};
pub(crate) use store::{PluginBootstrap, PluginInstallPreview, Store};

use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use crate::events::Events;

use metrics::Metrics;
use registry::Registry;

/// The plugins the kernel asks, what each call cost, and who is told when one
/// fails.
///
/// Held by [`crate::app::AppState`]. It is made once and shared, because the
/// order the user arranged and the count of failures behind a plugin that has
/// stopped answering are the same facts for every thread that asks.
pub(crate) struct PluginHost {
    events: Arc<dyn Events>,
    /// The plugins the kernel asks, in the user's order.
    plugins: Mutex<Registry>,
    /// The calls that have been made, for the status line and the diagnostics.
    calls: Mutex<Metrics>,
}

impl PluginHost {
    pub(crate) fn new(events: Arc<dyn Events>) -> Self {
        Self {
            events,
            plugins: Mutex::new(Registry::default()),
            calls: Mutex::new(Metrics::default()),
        }
    }

    /// Puts a plugin into the rotation, or back into it, with the body the
    /// kernel will ask.
    ///
    /// The body arrives here rather than being built here: which half a plugin
    /// has, and what a body is made of, is what loading decides (#86) and what
    /// the runtime knows (#87). The host's part is only that it will be asked.
    pub(crate) fn enable(&self, plugin: &str, body: Arc<dyn Runner>) {
        self.registry().enable(plugin, body);
    }

    /// Stops asking a plugin, keeping its place in the order.
    pub(crate) fn disable(&self, plugin: &str) {
        self.registry().disable(plugin);
    }

    /// Puts the plugins in the order the user arranged them.
    pub(crate) fn reorder(&self, order: &[String]) {
        self.registry().reorder(order);
    }

    /// The plugins the kernel asks, in order.
    pub(crate) fn enabled(&self) -> Vec<String> {
        self.registry().enabled()
    }

    /// The calls that have been made, oldest first.
    pub(crate) fn calls(&self) -> Vec<CallRecord> {
        self.metrics().recent()
    }

    /// The plugins the kernel asks, in order, as (id, body).
    fn asking(&self) -> Vec<(String, Arc<dyn Runner>)> {
        self.registry().asking()
    }

    /// One named plugin's body, if the kernel is asking it.
    fn asking_one(&self, plugin: &str) -> Option<Arc<dyn Runner>> {
        self.registry().asking_one(plugin)
    }

    /// Writes down how one call ended and what it cost.
    fn write_down(
        &self,
        plugin: &str,
        mount_point: &'static str,
        outcome: CallOutcome,
        elapsed: Duration,
    ) {
        self.metrics().record(CallRecord {
            plugin: plugin.to_string(),
            mount_point,
            outcome,
            elapsed,
        });
    }

    /// The registry.
    ///
    /// A poisoned lock is taken back rather than raised: no plugin call happens
    /// while either lock is held, so nothing a plugin does can poison one, and
    /// a panic somewhere else must not turn into a plugin system that throws on
    /// every mount. That would be the opposite of what this module is for.
    fn registry(&self) -> MutexGuard<'_, Registry> {
        self.plugins
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// The calls that have been made.
    fn metrics(&self) -> MutexGuard<'_, Metrics> {
        self.calls
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}
