//! Who the kernel asks, in what order, and who has stopped answering.
//!
//! The order is the user's. It decides who answers first, which is the only
//! place it matters — a mount point that several plugins contribute to
//! (ADR 0045 §3) — and it is therefore a value the user sets rather than an
//! accident of when each plugin was installed.
//!
//! Nothing about a plugin itself is here: not what it declares, not whether it
//! loaded, not what it is doing. This is the list, the order, and the count of
//! failures that takes a plugin out of the rotation.

use std::sync::Arc;

use super::runner::Runner;

/// How many failed calls take a plugin out of the rotation.
///
/// Not a punishment, and not a judgement about the plugin: it is what stops a
/// plugin that fails on every render from filling the screen with
/// notifications, which is the whole reason the count exists (ADR 0043 §5).
const FAILURES_BEFORE_STOPPING: usize = 5;

/// One plugin the host can ask.
struct Entry {
    id: String,
    body: Arc<dyn Runner>,
    /// Whether the kernel asks it at all. The fifth failure switches this off
    /// without the user asking; [`Registry::disable`] switches it off because
    /// they did. The two are one field because everything downstream asks the
    /// same question of it.
    asking: bool,
    /// How many of its calls have failed, over its whole life in this list.
    failures: usize,
}

/// The plugins the host can ask, in order.
#[derive(Default)]
pub(crate) struct Registry {
    entries: Vec<Entry>,
}

impl Registry {
    /// Puts a plugin into the rotation, or back into it.
    ///
    /// A plugin the user turns back on starts with a clean count. The five
    /// failures that switched it off are behind it, and leaving them standing
    /// would switch it off again on the first failure after — which would make
    /// the user's action look like it had not happened.
    /// One named plugin's body, if the host is asking it.
    ///
    /// For the mount point that is one plugin's own rather than every plugin's:
    /// an action the user picked from a menu belongs to the plugin whose item
    /// they picked, and asking the others would be work nobody asked for.
    pub(crate) fn asking_one(&self, plugin: &str) -> Option<Arc<dyn Runner>> {
        self.entries
            .iter()
            .find(|entry| entry.id == plugin && entry.asking)
            .map(|entry| entry.body.clone())
    }

    pub(crate) fn enable(&mut self, plugin: &str, body: Arc<dyn Runner>) {
        match self.entries.iter_mut().find(|entry| entry.id == plugin) {
            Some(entry) => {
                entry.body = body;
                entry.asking = true;
                entry.failures = 0;
            }
            None => self.entries.push(Entry {
                id: plugin.to_string(),
                body,
                asking: true,
                failures: 0,
            }),
        }
    }

    /// Stops asking a plugin, keeping its place in the order.
    ///
    /// The place is kept because switching a plugin off is meant to be
    /// temporary (spec #82, story 6): turning it back on must not move it past
    /// the plugins the user put after it.
    pub(crate) fn disable(&mut self, plugin: &str) {
        if let Some(entry) = self.entries.iter_mut().find(|entry| entry.id == plugin) {
            entry.asking = false;
        }
    }

    /// Puts the plugins in the order the user arranged them.
    ///
    /// An id the list names that the host does not know is ignored — the caller
    /// may be a stored order written before a plugin was uninstalled — and one
    /// the list leaves out keeps its place, in its old order, at the end.
    pub(crate) fn reorder(&mut self, order: &[String]) {
        let mut left = std::mem::take(&mut self.entries);
        let mut arranged = Vec::with_capacity(left.len());
        for id in order {
            if let Some(at) = left.iter().position(|entry| &entry.id == id) {
                arranged.push(left.remove(at));
            }
        }
        arranged.append(&mut left);
        self.entries = arranged;
    }

    /// The plugins the kernel asks, in order, as (id, body).
    ///
    /// Owned pairs rather than borrows of the entries, because no plugin call
    /// happens while this list is held: a body that takes its time — or one
    /// that comes back and asks the host something — must not be waited on by
    /// every other thread in the kernel.
    pub(crate) fn asking(&self) -> Vec<(String, Arc<dyn Runner>)> {
        self.entries
            .iter()
            .filter(|entry| entry.asking)
            .map(|entry| (entry.id.clone(), Arc::clone(&entry.body)))
            .collect()
    }

    /// Writes down one failed call, and stops asking a plugin that has failed
    /// too many times.
    pub(crate) fn failed(&mut self, plugin: &str) {
        if let Some(entry) = self.entries.iter_mut().find(|entry| entry.id == plugin) {
            entry.failures += 1;
            if entry.failures >= FAILURES_BEFORE_STOPPING {
                entry.asking = false;
            }
        }
    }

    /// The plugins the kernel asks, in order.
    pub(crate) fn enabled(&self) -> Vec<String> {
        self.asking().into_iter().map(|(id, _)| id).collect()
    }
}
