//! What an id may be, when it comes from the window.
//!
//! The other tests in this directory build the disk they want and then ask the
//! store about it; here the id is the thing under test. An id reaches the store
//! from the interface, and the interface shares this window's origin with a
//! plugin's own code (Q43), so an id is not an identity — it is a name this
//! kernel handed out. What a name may be is the difference between a command
//! that removes one plugin and a command that removes `$APPDATA`.
//!
//! Every id here is chosen so that, if the rule were not kept, what it names is
//! a directory this test made: [`Installed`] puts its plugins directory in the
//! system's temporary directory, so a test that aimed `..` at *that* would be
//! aiming at the machine's temporary directory. The plugins directory is nested
//! one level down for exactly that reason, and the file beside it is what a
//! test looks for afterwards.

use std::fs;

use serde_json::json;

use crate::plugins::fixture::{self, Installed};
use crate::plugins::manifest::FILE as MANIFEST;
use crate::plugins::store::Store;
use crate::repository::fixture::Fixture;

/// A manifest that will be copied in as `id`, with its own name spelled out.
fn named(id: &str, name: &str) -> serde_json::Value {
    let mut declared = fixture::manifest(id);
    declared["name"] = json!(name);
    declared
}

/// One plugin in a nested plugins directory, and the directory it is in.
fn nested(id: &str, name: &str) -> (Installed, std::path::PathBuf) {
    let space = Installed::new();
    let plugins = space.path().join("plugins");
    let directory = plugins.join(id);
    fs::create_dir_all(&directory).unwrap();
    fs::write(
        directory.join(MANIFEST),
        serde_json::to_string_pretty(&named(id, name)).unwrap(),
    )
    .unwrap();
    (space, plugins)
}

#[test]
fn an_id_that_would_reach_out_of_the_plugins_directory_is_refused() {
    let (space, plugins) = nested("cover", "Cover Fetcher");
    // A file of the application's own, beside the plugins directory: `$APPDATA`
    // holds the library, the thumbnails and the plugins, and it is what `..`
    // names. Every id below lands on something this test made.
    let library = space.path().join("enjoy.db");
    fs::write(&library, "the library").unwrap();
    let store = Store::new(plugins.clone());
    let index = Fixture::new();
    let mut repository = index.library().repository;

    for id in ["", "..", "cover/..", "cover/../cover", "../plugins/cover"] {
        let failure = store.uninstall(&mut repository, id, true).unwrap_err();

        assert_eq!(
            failure.code, "plugin.not_found",
            "{id:?} is not a name this kernel handed out"
        );
        assert_eq!(
            failure.params.get("plugin").map(String::as_str),
            Some(id),
            "the refusal names what was asked for"
        );
    }

    assert!(
        library.exists(),
        "nothing outside the plugins directory was touched"
    );
    assert!(plugins.is_dir(), "the plugins directory is not a plugin");
    assert!(
        plugins.join("cover").is_dir(),
        "and a path that lands back on a plugin is not a name either"
    );
}

#[test]
fn a_directory_whose_name_could_not_be_a_plugin_id_is_not_one() {
    let (_space, plugins) = nested("cover", "Cover Fetcher");
    let shouty = plugins.join("Cover");
    fs::create_dir_all(&shouty).unwrap();
    let store = Store::new(plugins);
    let index = Fixture::new();
    let mut repository = index.library().repository;

    let failure = store.uninstall(&mut repository, "Cover", true).unwrap_err();

    assert_eq!(failure.code, "plugin.not_found");
    assert!(
        shouty.is_dir(),
        "a name that could not be a plugin's is one no manifest inside it could match, \
         so it is a row that says it failed and not a plugin to act on"
    );
}
