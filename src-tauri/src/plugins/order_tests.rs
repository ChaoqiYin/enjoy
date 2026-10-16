//! The order the user arranged the plugins in: what it is, and what happens to
//! a place.
//!
//! Split out of `store_tests.rs` when the two together passed the line limit,
//! and it is a responsibility rather than a count that decides what is here: an
//! arrangement is a fact of its own, kept in a file of its own
//! ([`super::order`]), and what this file holds is everything about that fact —
//! where it is read from, who refuses to write it, and which lifecycle actions
//! take a place away or leave it.
//!
//! What the arrangement *decides* is [`super::loading`]'s, and its test is
//! there: this file stops at the listing the page and the lifecycle commands
//! read.

use serde_json::json;

use crate::plugins::fixture::{self, Installed};
use crate::plugins::store::Store;
use crate::repository::fixture::Fixture;

/// The store over a directory a test laid plugins out in.
fn store(space: &Installed) -> Store {
    Store::new(space.path().to_path_buf())
}

/// A manifest that will be copied in as `id`, with its own name spelled out.
fn named(id: &str, name: &str) -> serde_json::Value {
    let mut declared = fixture::manifest(id);
    declared["name"] = json!(name);
    declared
}

/// Three plugins, installed and named after themselves.
///
/// The directory comes back rather than a store over it: a store holds a path
/// and nothing else, and a caller that held one across the whole test could not
/// read the file the arrangement was written into.
fn three() -> Installed {
    let space = Installed::new();
    for id in ["first", "second", "third"] {
        space.plugin(id, &named(id, id));
    }
    space
}

/// The ids of a listing, in the order it has them.
fn ids(plugins: &[crate::plugins::PluginBootstrap]) -> Vec<&str> {
    plugins.iter().map(|plugin| plugin.id.as_str()).collect()
}

#[test]
fn the_order_the_user_arranged_is_the_order_the_plugins_are_listed_in() {
    let space = three();

    let plugins = store(&space)
        .set_order(&[
            "third".to_string(),
            "first".to_string(),
            "second".to_string(),
        ])
        .unwrap();

    assert_eq!(ids(&plugins), vec!["third", "first", "second"]);
    // On disk rather than in this answer: a second reader of the same directory
    // gets the same order without having been told anything.
    let ids: Vec<String> = store(&space)
        .ordered()
        .unwrap()
        .into_iter()
        .map(|plugin| plugin.id)
        .collect();
    assert_eq!(ids, vec!["third", "first", "second"]);
}

#[test]
fn a_plugin_the_order_does_not_name_comes_after_the_ones_it_does() {
    // A plugin just installed, or a directory the user copied into place: it has
    // no place yet, and the place it gets is the end — the same rule the
    // rotation applies, so that the page and the kernel do not disagree about a
    // plugin nobody has arranged.
    let space = three();
    store(&space).set_order(&["third".to_string()]).unwrap();

    let listed = store(&space).ordered().unwrap();

    assert_eq!(ids(&listed), vec!["third", "first", "second"]);
}

#[test]
fn uninstalling_a_plugin_takes_its_place_out_of_the_order() {
    let space = three();
    let store = store(&space);
    store
        .set_order(&[
            "third".to_string(),
            "first".to_string(),
            "second".to_string(),
        ])
        .unwrap();

    let mut repository = Fixture::new().library().repository;
    let plugins = store.uninstall(&mut repository, "third", false).unwrap();

    assert_eq!(ids(&plugins), vec!["first", "second"]);
    assert_eq!(
        store.order(),
        vec!["first".to_string(), "second".to_string()],
        "the file names what is installed, not what used to be"
    );
}

#[test]
fn an_order_that_names_a_plugin_that_is_not_installed_is_refused() {
    // The ids arrive from the window, and an id this kernel never handed out is
    // a page out of step with the disk rather than a place to write down.
    let space = Installed::new();
    space.plugin("cover", &named("cover", "Cover Fetcher"));
    let store = store(&space);

    let failure = store
        .set_order(&["cover".to_string(), "ghost".to_string()])
        .unwrap_err();

    assert_eq!(failure.code, "plugin.not_found");
    assert!(
        store.order().is_empty(),
        "and nothing was written down before the refusal"
    );
}

#[test]
fn switching_a_plugin_off_keeps_its_place() {
    // The same rule the rotation holds: switching one off is meant to be
    // temporary, and switching it back on must not move it past the plugins the
    // user put after it (spec #82, story 6).
    let space = three();
    let store = store(&space);
    store
        .set_order(&[
            "third".to_string(),
            "first".to_string(),
            "second".to_string(),
        ])
        .unwrap();

    let plugins = store.set_enabled("third", false).unwrap();

    assert_eq!(ids(&plugins), vec!["third", "first", "second"]);
    assert_eq!(
        store.order(),
        vec![
            "third".to_string(),
            "first".to_string(),
            "second".to_string()
        ]
    );
}
