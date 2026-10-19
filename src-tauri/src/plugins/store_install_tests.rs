//! What the kernel does when a user brings a plugin in: what a pre-flight says
//! it would do, what installing from a folder copies in, and what an archive is
//! unpacked into.
//!
//! Split out of `store_tests.rs` when that file reached the line limit the
//! repository keeps — the two halves are two command families (one is about the
//! plugins already on disk, this one is about a source being brought in), and
//! the five helpers they share are borrowed from next door rather than copied,
//! so a fixture that moves is moved once.
//!
//! Everything here is about a real directory, for the reason the other half
//! gives: loading is about which directories are there, what their manifests
//! say, and what gets written where.

use std::fs;
use std::path::Path;

use serde_json::json;

use crate::plugins::fixture::{self, Installed};
use crate::plugins::manifest::FILE as MANIFEST;

use super::store_tests::{archive, named, row, source, store};

#[test]
fn a_preview_says_where_it_would_go_and_what_it_brings() {
    let space = Installed::new();
    let source = Installed::new();
    let mut declared = named("cover", "Cover Fetcher");
    declared["capabilities"] = json!(["fetch", "storage"]);
    declared["body"] = json!("body.wasm");
    source.plugin("cover", &declared);

    let preview = store(&space).preview(&source.path().join("cover")).unwrap();

    assert_eq!(
        preview.destination,
        space.path().join("cover").to_string_lossy(),
        "the user is told where the plugin will land, which is the thing they cannot see"
    );
    assert_eq!(preview.plugin.name, "Cover Fetcher");
    assert_eq!(preview.plugin.capabilities, vec!["fetch", "storage"]);
    assert!(
        preview.plugin.has_body,
        "the preview says which halves it has"
    );
    assert!(preview.plugin.entry.is_some());
    assert!(
        !space.path().join("cover").exists(),
        "a preview is a preview: nothing has been copied in"
    );
}

#[test]
fn installing_a_folder_copies_it_in_and_switches_it_on() {
    let space = Installed::new();
    let source = source("cover", "Cover Fetcher");
    fs::write(
        source.path().join("cover").join("index.js"),
        "export default 1;",
    )
    .unwrap();

    let plugins = store(&space).install(&source.path().join("cover")).unwrap();

    assert!(
        row(&plugins, "cover").enabled,
        "installing is the user saying yes"
    );
    assert_eq!(
        fs::read_to_string(space.path().join("cover").join("index.js")).unwrap(),
        "export default 1;",
        "the plugin's own files come with it"
    );
    assert_eq!(
        row(&plugins, "cover")
            .entry
            .as_deref()
            .map(|entry| Path::new(entry).exists()),
        Some(true),
        "and the entry the window is told to load is a file that is really there"
    );
}

#[test]
fn installing_from_an_archive_unpacks_it() {
    let space = Installed::new();
    let source = Installed::new();
    let manifest = serde_json::to_string_pretty(&named("cover", "Cover Fetcher")).unwrap();
    let zip_path = source.path().join("cover.zip");
    archive(
        &zip_path,
        &[
            (MANIFEST, manifest.as_str()),
            ("index.js", "export default 1;"),
        ],
    );

    let plugins = store(&space).install(&zip_path).unwrap();

    assert_eq!(row(&plugins, "cover").name, "Cover Fetcher");
    assert!(space.path().join("cover").join("index.js").is_file());
}

#[test]
fn an_archive_that_holds_the_plugin_one_level_down_is_installed_too() {
    let space = Installed::new();
    let source = Installed::new();
    let manifest = serde_json::to_string_pretty(&named("cover", "Cover Fetcher")).unwrap();
    // What a repository's "download the source" zip looks like: everything
    // inside a directory named after the project.
    let zip_path = source.path().join("cover-fetcher-main.zip");
    archive(
        &zip_path,
        &[
            ("cover-fetcher-main/plugin.json", manifest.as_str()),
            ("cover-fetcher-main/index.js", "export default 1;"),
        ],
    );

    let plugins = store(&space).install(&zip_path).unwrap();

    assert_eq!(row(&plugins, "cover").id, "cover");
    assert!(space.path().join("cover").join(MANIFEST).is_file());
}

#[test]
fn something_that_is_not_a_plugin_is_refused_before_anything_is_copied() {
    let space = Installed::new();
    let source = Installed::new();
    fs::write(source.path().join("readme.txt"), "nothing to see").unwrap();

    let failure = store(&space)
        .install(&source.path().join("readme.txt"))
        .unwrap_err();

    assert_eq!(failure.code, "plugin.install.invalid_source");
    assert_eq!(
        failure.params.get("source").map(String::as_str),
        Some(source.path().join("readme.txt").to_string_lossy().as_ref())
    );
    assert_eq!(
        fs::read_dir(space.path()).unwrap().count(),
        0,
        "a source the kernel cannot read leaves the plugins directory as it was"
    );
}

#[test]
fn a_plugin_whose_manifest_did_not_validate_is_refused_before_anything_is_copied() {
    let space = Installed::new();
    let source = Installed::new();
    let mut broken = named("cover", "Cover Fetcher");
    broken["capabilities"] = json!(["filesystem"]);
    source.plugin("cover", &broken);

    let failure = store(&space)
        .install(&source.path().join("cover"))
        .unwrap_err();

    assert_eq!(failure.code, "plugin.manifest.capability_not_allowed");
    assert_eq!(
        failure.params.get("plugin").map(String::as_str),
        Some("cover")
    );
    assert!(!space.path().join("cover").exists());
}

#[test]
fn installing_a_plugin_that_is_already_there_is_refused() {
    let space = Installed::new();
    space.plugin("cover", &named("cover", "Cover Fetcher"));
    let source = source("cover", "Cover Fetcher");

    let failure = store(&space)
        .install(&source.path().join("cover"))
        .unwrap_err();

    assert_eq!(failure.code, "plugin.install.exists");
    assert_eq!(
        failure.params.get("plugin").map(String::as_str),
        Some("cover")
    );
}

#[test]
fn a_plugin_with_a_body_and_no_interface_is_a_row_with_a_body() {
    let space = Installed::new();
    let mut declared = fixture::manifest("cover");
    declared.as_object_mut().unwrap().remove("interface");
    declared["body"] = json!("body.wasm");
    space.plugin("cover", &declared);

    let plugins = store(&space).list().unwrap();

    assert!(plugins[0].has_body);
    assert_eq!(
        plugins[0].entry, None,
        "a body-only plugin has nothing for the interface side to load, and is still a plugin"
    );
}
