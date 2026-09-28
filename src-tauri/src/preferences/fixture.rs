//! A store in memory, for tests that are about a rule rather than about a file.
//!
//! It lives here rather than beside any one test because more than one module
//! needs it: `preferences` checks its own rule over it, and the modules that own
//! a preference check through it that what they kept is what the next reader
//! sees. What it cannot stand in for is the file — the plugin, its map, and the
//! save that can fail halfway are the adapter's own business.

use std::cell::{Cell, RefCell};
use std::collections::BTreeMap;

use super::Backing;

/// The store, holding what a test put in it, and refusing to write when asked
/// to. A refused write keeps everything: a store that wrote half of what it was
/// given would be a different store from the one this stands in for.
#[derive(Default)]
pub(crate) struct Memory {
    values: RefCell<BTreeMap<String, String>>,
    failing: Cell<bool>,
}

impl Memory {
    /// Empty, and accepting writes.
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Holding these keys, as if a previous run had written them.
    pub(crate) fn holding(values: &[(&str, &str)]) -> Self {
        let memory = Self::default();
        for (key, value) in values {
            memory
                .values
                .borrow_mut()
                .insert((*key).to_string(), (*value).to_string());
        }
        memory
    }

    /// Refusing every write, which is the failure path the file's own adapter
    /// has to repair and this one has nothing to repair.
    pub(crate) fn failing() -> Self {
        let memory = Self::default();
        memory.failing.set(true);
        memory
    }

    /// What is stored under a key, whether or not it is a value this
    /// application would have written.
    pub(crate) fn held(&self, key: &str) -> Option<String> {
        self.values.borrow().get(key).cloned()
    }
}

impl Backing for Memory {
    fn get(&self, key: &str) -> Option<String> {
        self.held(key)
    }

    fn set(&self, values: &[(&str, &str)]) -> Result<(), String> {
        if self.failing.get() {
            return Err("the disk said no".to_string());
        }
        for (key, value) in values {
            self.values
                .borrow_mut()
                .insert((*key).to_string(), (*value).to_string());
        }
        Ok(())
    }
}
