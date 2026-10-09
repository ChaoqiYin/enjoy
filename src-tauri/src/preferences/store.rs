//! The preferences file, as Tauri's store keeps it.
//!
//! This is the adapter half of [`super::Backing`]: the file's name, the plugin
//! that owns it, and the one thing about that plugin this module has to know to
//! keep the promise it makes — a write that fails leaves the store holding what
//! it held before.
//!
//! The promise is not free. `tauri-plugin-store` keeps its values in a map and
//! writes the whole map out when asked, so a `save` that fails leaves the map
//! ahead of the file: the next read would answer with a value that was never
//! kept. Putting the map back is therefore this adapter's business and nobody
//! else's — a store that behaved differently would need none of it, and the rule
//! above it would be unchanged.

use serde_json::json;
use tauri::AppHandle;
use tauri_plugin_store::{Store, StoreExt};

use super::{Backing, Preferences, FILE};
use crate::error::AppError;

/// The file, opened. Read calls and writes go through what this answers with.
pub(crate) fn open(app: &AppHandle) -> Result<Preferences<File>, AppError> {
    let store = app
        .store(FILE)
        .map_err(|error| AppError::new("settings.read_failed", error))?;
    Ok(Preferences::new(File { store }))
}

pub(crate) struct File {
    store: std::sync::Arc<Store<tauri::Wry>>,
}

impl Backing for File {
    fn get(&self, key: &str) -> Option<String> {
        self.store
            .get(key)
            .and_then(|value| value.as_str().map(str::to_owned))
    }

    fn set(&self, values: &[(&str, &str)]) -> Result<(), String> {
        // What the store holds now, for every key about to be written: this is
        // what a save that fails is put back to.
        let previous: Vec<(&str, Option<serde_json::Value>)> = values
            .iter()
            .map(|(key, _)| (*key, self.store.get(key)))
            .collect();
        for (key, value) in values {
            self.store.set(*key, json!(value));
        }
        if let Err(error) = self.store.save() {
            for (key, held) in previous {
                match held {
                    Some(value) => {
                        self.store.set(key, value);
                    }
                    // Nothing was there before: the key belongs to the file
                    // only if it was written, and this one was not.
                    None => {
                        let _ = self.store.delete(key);
                    }
                }
            }
            return Err(error.to_string());
        }
        Ok(())
    }
}
