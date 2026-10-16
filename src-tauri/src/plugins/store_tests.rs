//! What the kernel does to the plugins on disk: what it lists, what it
//! switches on, what it copies in, and what it leaves behind.
//!
//! Everything here is about a real directory, because that is what loading is
//! about — which directories are there, what their manifests say, which of them
//! the enable record names. Nothing in this file asks the host anything: what
//! the *running* window is asking is `super::PluginHost`'s, and a lifecycle
//! action does not reach it (spec #82, 「不做热插拔」).

use std::fs;
use std::io::Write;
use std::path::Path;

use serde_json::json;

use crate::plugins::fixture::{self, Installed};
use crate::plugins::manifest::FILE as MANIFEST;
use crate::plugins::store::{PluginBootstrap, Store};
use crate::repository::fixture::{video_fields, Fixture};

/// The store over a directory a test laid plugins out in.
fn store(space: &Installed) -> Store {
    Store::new(space.path().to_path_buf())
}

/// One row, by id.
fn row<'a>(plugins: &'a [PluginBootstrap], id: &str) -> &'a PluginBootstrap {
    plugins
        .iter()
        .find(|plugin| plugin.id == id)
        .unwrap_or_else(|| panic!("no row for {id}"))
}

/// A manifest that will be copied in as `id`, with its own name spelled out.
fn named(id: &str, name: &str) -> serde_json::Value {
    let mut declared = fixture::manifest(id);
    declared["name"] = json!(name);
    declared
}

/// A zip holding these files, written the way an author's tool would.
fn archive(path: &Path, entries: &[(&str, &str)]) {
    let mut zip = zip::write::ZipWriter::new(fs::File::create(path).unwrap());
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (name, body) in entries {
        zip.start_file(*name, options).unwrap();
        zip.write_all(body.as_bytes()).unwrap();
    }
    zip.finish().unwrap();
}

/// A source folder a user might point at, named the way a download is.
fn source(id: &str, name: &str) -> Installed {
    let space = Installed::new();
    space.plugin(id, &named(id, name));
    space
}

#[test]
fn nothing_is_switched_on_until_the_user_says_so() {
    let space = Installed::new();
    space.plugin("cover", &named("cover", "Cover Fetcher"));

    let plugins = store(&space).list().unwrap();

    assert_eq!(plugins.len(), 1);
    assert!(
        !plugins[0].enabled,
        "a directory copied into place is a plugin the user has not agreed to run yet"
    );
    assert!(plugins[0].failure.is_none());
}

#[test]
fn the_plugins_are_listed_by_id() {
    let space = Installed::new();
    for id in ["second", "first", "third"] {
        space.plugin(id, &named(id, id));
    }

    let ids: Vec<String> = store(&space)
        .list()
        .unwrap()
        .into_iter()
        .map(|plugin| plugin.id)
        .collect();

    assert_eq!(ids, vec!["first", "second", "third"]);
}

#[test]
fn a_plugin_that_did_not_validate_is_listed_with_its_reason() {
    let space = Installed::new();
    let mut broken = fixture::manifest("cover");
    broken["apiVersion"] = json!(99);
    space.plugin("cover", &broken);

    let plugins = store(&space).list().unwrap();

    let failure = plugins[0]
        .failure
        .as_ref()
        .expect("it is a row, and a row with a reason");
    assert_eq!(failure.code, "plugin.manifest.api_too_new");
    assert_eq!(
        failure.params.get("plugin").map(String::as_str),
        Some("cover"),
        "the reason names the plugin it is about"
    );
    assert_eq!(
        plugins[0].name, "cover",
        "a manifest that did not get as far as a name leaves the id as the name"
    );
}

#[test]
fn a_directory_that_is_not_a_plugin_is_a_row_that_says_so() {
    let space = Installed::new();
    space.stray("leftovers");

    let plugins = store(&space).list().unwrap();

    assert_eq!(plugins.len(), 1);
    assert_eq!(
        plugins[0]
            .failure
            .as_ref()
            .map(|failure| failure.code.as_str()),
        Some("plugin.manifest.unreadable"),
        "a directory with no manifest in it is listed rather than silently passed over"
    );
}

#[test]
fn a_plugins_directory_that_is_not_there_yet_is_no_plugins() {
    let space = Installed::new();
    let nowhere = space.path().join("not-created-yet");

    let plugins = Store::new(nowhere).list().unwrap();

    assert!(
        plugins.is_empty(),
        "a fresh installation has no plugins directory"
    );
}

#[test]
fn switching_one_on_writes_it_down_and_leaves_the_directory_alone() {
    let space = Installed::new();
    let directory = space.plugin("cover", &named("cover", "Cover Fetcher"));

    let plugins = store(&space).set_enabled("cover", true).unwrap();

    assert!(row(&plugins, "cover").enabled);
    assert!(directory.is_dir(), "switching a plugin on does not move it");
    assert!(
        store(&space).list().unwrap()[0].enabled,
        "and it is still on when the page is read again"
    );
}

#[test]
fn switching_one_off_keeps_everything_it_brought() {
    let space = Installed::new();
    let directory = space.plugin("cover", &named("cover", "Cover Fetcher"));
    let store = store(&space);
    store.set_enabled("cover", true).unwrap();

    let plugins = store.set_enabled("cover", false).unwrap();

    assert!(!row(&plugins, "cover").enabled);
    assert!(
        directory.is_dir(),
        "switching off is not uninstalling: the plugin is still there to switch back on"
    );
    assert!(
        directory.join(MANIFEST).is_file(),
        "and so is everything in it"
    );
}

#[test]
fn switching_a_plugin_that_is_not_installed_is_refused() {
    let space = Installed::new();

    let failure = store(&space).set_enabled("cover", true).unwrap_err();

    assert_eq!(failure.code, "plugin.not_found");
    assert_eq!(
        failure.params.get("plugin").map(String::as_str),
        Some("cover")
    );
}

#[test]
fn uninstalling_removes_the_plugin_and_keeps_what_it_wrote() {
    let space = Installed::new();
    let directory = space.plugin("cover", &named("cover", "Cover Fetcher"));
    let store = store(&space);
    store.set_enabled("cover", true).unwrap();
    let index = Fixture::new();
    {
        let mut repository = index.library().repository;
        video_fields(&repository, &[(1, "cover", "/a.jpg", "cover")]);

        let plugins = store.uninstall(&mut repository, "cover", false).unwrap();

        assert!(plugins.is_empty(), "the row goes with the directory");
        assert_eq!(
            repository.plugin_content_rows("cover").unwrap(),
            1,
            "the default is to keep the content, so a slip of the hand costs nothing"
        );
    }
    assert!(!directory.exists());
}

#[test]
fn uninstalling_with_the_content_takes_the_rows_with_it() {
    let space = Installed::new();
    space.plugin("cover", &named("cover", "Cover Fetcher"));
    let index = Fixture::new();
    let mut repository = index.library().repository;
    video_fields(
        &repository,
        &[
            (1, "cover", "/a.jpg", "cover"),
            (1, "rating", "5", "ratings"),
        ],
    );

    store(&space)
        .uninstall(&mut repository, "cover", true)
        .unwrap();

    assert_eq!(repository.plugin_content_rows("cover").unwrap(), 0);
    assert_eq!(
        repository.plugin_content_rows("ratings").unwrap(),
        1,
        "one plugin's content is not another's"
    );
}

#[test]
fn safe_mode_switches_everything_off_and_keeps_the_plugins() {
    let space = Installed::new();
    let first = space.plugin("cover", &named("cover", "Cover Fetcher"));
    let second = space.plugin("ratings", &named("ratings", "Ratings"));
    let store = store(&space);
    store.set_enabled("cover", true).unwrap();
    store.set_enabled("ratings", true).unwrap();

    let plugins = store.set_aside().unwrap();

    assert!(
        plugins.iter().all(|plugin| !plugin.enabled),
        "after safe mode nothing is loaded"
    );
    assert_eq!(
        space.contents(),
        vec!["cover", "ratings"],
        "and every plugin is still installed, so nothing has to be found again"
    );
    assert!(first.is_dir() && second.is_dir());
    assert!(
        !space.path().join(crate::plugins::store::RECORD).exists(),
        "the record is put aside rather than emptied"
    );
    let backups: Vec<String> = fs::read_dir(space.path())
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".bak"))
        .collect();
    assert_eq!(
        backups.len(),
        1,
        "and what the user had is kept, under a name that says when it was set aside"
    );
}

#[test]
fn safe_mode_twice_keeps_both_records() {
    let space = Installed::new();
    space.plugin("cover", &named("cover", "Cover Fetcher"));
    let store = store(&space);
    store.set_enabled("cover", true).unwrap();
    store.set_aside().unwrap();
    store.set_enabled("cover", true).unwrap();

    store.set_aside().unwrap();

    let backups = fs::read_dir(space.path())
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".bak"))
        .count();
    assert_eq!(backups, 2, "two safe modes do not lose the first record");
}

#[test]
fn safe_mode_with_nothing_switched_on_is_not_a_failure() {
    let space = Installed::new();
    space.plugin("cover", &named("cover", "Cover Fetcher"));

    let plugins = store(&space).set_aside().unwrap();

    assert_eq!(plugins.len(), 1);
    assert!(!plugins[0].enabled);
}

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
