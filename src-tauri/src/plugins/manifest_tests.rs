//! What a manifest has to say before the kernel will load the plugin.
//!
//! Four checks, and one test per path through them: the fields the kernel needs
//! are all there, the id is one a directory could be named, the interface
//! version is one this kernel speaks, and every declared capability is one the
//! kernel grants. What all four have in common is that failing one of them is
//! not an error — the plugin is listed with the reason and left alone — so what
//! these tests read is the reason, not a failure to load.

use std::path::Path;

use serde_json::json;

use crate::plugins::fixture::{self, Installed};
use crate::plugins::manifest::{self, Manifest, Problem};

/// What reading this directory was refused with.
fn refused(directory: &Path) -> Problem {
    manifest::read(directory).expect_err("this manifest should not have been accepted")
}

/// One param of a refusal, by name.
fn param(problem: &Problem, key: &str) -> Option<String> {
    problem
        .params
        .iter()
        .find(|(name, _)| *name == key)
        .map(|(_, value)| value.clone())
}

#[test]
fn a_manifest_that_says_everything_is_read() {
    let space = Installed::new();
    let mut declared = fixture::manifest("cover");
    declared["name"] = json!("Cover Fetcher");
    declared["author"] = json!("someone else");
    declared["capabilities"] = json!(["fetch", "storage"]);
    let directory = space.plugin("cover", &declared);

    let manifest: Manifest = manifest::read(&directory).expect("this manifest is complete");

    assert_eq!(manifest.id, "cover");
    assert_eq!(manifest.name, "Cover Fetcher");
    assert_eq!(manifest.author, "someone else");
    assert_eq!(manifest.api_version, manifest::API_VERSION);
    assert_eq!(manifest.capabilities, vec!["fetch", "storage"]);
    assert_eq!(manifest.interface.as_deref(), Some("index.js"));
    assert_eq!(manifest.body, None);
}

#[test]
fn a_manifest_missing_a_required_field_names_the_field() {
    let space = Installed::new();

    for field in ["id", "name", "author", "apiVersion"] {
        let mut declared = fixture::manifest("cover");
        declared.as_object_mut().unwrap().remove(field);
        let directory = space.plugin("cover", &declared);

        let problem = refused(&directory);

        assert_eq!(
            problem.code, "plugin.manifest.incomplete",
            "a manifest with no {field} is not a manifest the kernel can read"
        );
        assert_eq!(
            param(&problem, "field").as_deref(),
            Some(field),
            "the plugin author has to be told which field is missing"
        );
    }
}

#[test]
fn a_field_that_is_there_but_empty_counts_as_missing() {
    let space = Installed::new();
    let mut declared = fixture::manifest("cover");
    declared["name"] = json!("   ");
    let directory = space.plugin("cover", &declared);

    let problem = refused(&directory);

    assert_eq!(problem.code, "plugin.manifest.incomplete");
    assert_eq!(param(&problem, "field").as_deref(), Some("name"));
}

#[test]
fn an_id_that_could_not_be_a_directory_name_is_refused() {
    let space = Installed::new();

    for id in [
        "Cover Fetcher",
        "cover/fetcher",
        "../cover",
        "-cover",
        "cover.json",
    ] {
        let mut declared = fixture::manifest("cover");
        declared["id"] = json!(id);
        let directory = space.plugin("cover", &declared);

        let problem = refused(&directory);

        assert_eq!(
            problem.code, "plugin.manifest.invalid_id",
            "`{id}` cannot name a directory this application can find again"
        );
        assert_eq!(param(&problem, "id").as_deref(), Some(id));
    }
}

#[test]
fn an_id_that_is_not_the_directorys_own_name_is_refused() {
    let space = Installed::new();
    // The manifest says `cover-fetcher`; the directory it lives in is `cover`.
    // The directory is where the plugin is, so the id has to be its name.
    let directory = space.plugin("cover", &fixture::manifest("cover-fetcher"));

    let problem = refused(&directory);

    assert_eq!(problem.code, "plugin.manifest.invalid_id");
    assert_eq!(param(&problem, "id").as_deref(), Some("cover-fetcher"));
    assert_eq!(
        param(&problem, "directory").as_deref(),
        Some("cover"),
        "the plugin author is told which name the id has to be"
    );
}

#[test]
fn a_manifest_written_for_a_newer_kernel_says_so_in_its_own_words() {
    let space = Installed::new();
    let mut declared = fixture::manifest("cover");
    declared["apiVersion"] = json!(manifest::API_VERSION + 1);
    let directory = space.plugin("cover", &declared);

    let problem = refused(&directory);

    assert_eq!(
        problem.code, "plugin.manifest.api_too_new",
        "the kernel is what is out of date, and that is not the same thing to do something about as a plugin written wrong"
    );
    assert_eq!(param(&problem, "required").as_deref(), Some("2"));
    assert_eq!(param(&problem, "supported").as_deref(), Some("1"));
}

#[test]
fn a_manifest_written_for_a_kernel_this_one_no_longer_is_is_refused() {
    let space = Installed::new();
    let mut declared = fixture::manifest("cover");
    declared["apiVersion"] = json!(0);
    let directory = space.plugin("cover", &declared);

    assert_eq!(refused(&directory).code, "plugin.manifest.api_unsupported");
}

#[test]
fn a_capability_the_kernel_does_not_grant_is_refused_by_name() {
    let space = Installed::new();
    let mut declared = fixture::manifest("cover");
    declared["capabilities"] = json!(["fetch", "filesystem"]);
    let directory = space.plugin("cover", &declared);

    let problem = refused(&directory);

    assert_eq!(problem.code, "plugin.manifest.capability_not_allowed");
    assert_eq!(
        param(&problem, "capability").as_deref(),
        Some("filesystem"),
        "the kernel says which one it does not have rather than that the list is wrong"
    );
}

#[test]
fn every_capability_the_kernel_grants_is_accepted() {
    let space = Installed::new();
    let mut declared = fixture::manifest("cover");
    declared["capabilities"] = json!(manifest::CAPABILITIES);
    let directory = space.plugin("cover", &declared);

    let manifest = manifest::read(&directory).expect("the whole allow-list is allowed");

    assert_eq!(manifest.capabilities.len(), manifest::CAPABILITIES.len());
}

#[test]
fn a_plugin_with_neither_half_is_refused() {
    let space = Installed::new();
    let mut declared = fixture::manifest("cover");
    declared.as_object_mut().unwrap().remove("interface");
    let directory = space.plugin("cover", &declared);

    assert_eq!(refused(&directory).code, "plugin.manifest.no_halves");
}

#[test]
fn a_plugin_with_only_a_body_is_a_plugin() {
    let space = Installed::new();
    let mut declared = fixture::manifest("cover");
    declared.as_object_mut().unwrap().remove("interface");
    declared["body"] = json!("body.wasm");
    let directory = space.plugin("cover", &declared);

    let manifest = manifest::read(&directory).expect("a body alone is one of the two halves");

    assert_eq!(manifest.interface, None);
    assert_eq!(manifest.body.as_deref(), Some("body.wasm"));
}

#[test]
fn an_entry_that_leaves_the_plugins_own_directory_is_refused() {
    let space = Installed::new();

    for entry in [
        "../../elsewhere/index.js",
        "/etc/passwd",
        "nested/../../out.js",
    ] {
        let mut declared = fixture::manifest("cover");
        declared["interface"] = json!(entry);
        let directory = space.plugin("cover", &declared);

        let problem = refused(&directory);

        assert_eq!(
            problem.code, "plugin.manifest.invalid_entry",
            "`{entry}` would reach for a file that is not the plugin's"
        );
        assert_eq!(param(&problem, "entry").as_deref(), Some(entry));
    }
}

#[test]
fn an_entry_inside_the_plugins_own_directory_may_be_nested() {
    let space = Installed::new();
    let mut declared = fixture::manifest("cover");
    declared["interface"] = json!("dist/index.js");
    let directory = space.plugin("cover", &declared);

    let manifest = manifest::read(&directory).expect("a path inside the directory is the point");

    assert_eq!(manifest.interface.as_deref(), Some("dist/index.js"));
}

#[test]
fn a_manifest_that_is_not_there_is_refused_rather_than_missing() {
    let space = Installed::new();
    let directory = space.stray("leftovers");

    assert_eq!(refused(&directory).code, "plugin.manifest.unreadable");
}

#[test]
fn a_manifest_that_is_not_json_is_refused_the_same_way() {
    let space = Installed::new();
    let directory = space.plugin_text("cover", "{ this is not json");

    assert_eq!(refused(&directory).code, "plugin.manifest.unreadable");
}

#[test]
fn a_refusal_can_be_made_to_name_the_plugin_it_is_about() {
    let space = Installed::new();
    let directory = space.stray("leftovers");

    let problem = refused(&directory).named("leftovers");

    assert_eq!(
        problem.params.first(),
        Some(&("plugin", "leftovers".to_string())),
        "the plugin is what the message starts with, so it is first in the params"
    );
}
