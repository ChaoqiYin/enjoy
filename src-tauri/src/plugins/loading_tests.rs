//! What starting the application does with what is on disk.
//!
//! Every test here is about one question: which plugins the running window will
//! ask, given a plugins directory and an enable record. The bodies are real
//! wasm modules — the same shape `super::wasm::tests` builds — because the thing
//! being tested is exactly the step that turns a directory into a running
//! instance, and a double would be that step written twice.

use super::fixture::{manifest, Installed};
use super::{loading, PluginHost, Store};
use crate::events::Recorded;
use crate::repository::fixture::Fixture;
use crate::repository::Repository;
use std::fs;
use std::sync::{Arc, Mutex, OnceLock};

/// A library for the loader to hand the bodies it builds.
///
/// One for the whole module, made on first use and kept for the run: these
/// tests are about which plugins get asked, and a plugin that never runs a
/// `task_*` call never reads a row — so what the library holds is beside the
/// point, and a fresh database per test would be eleven copies of a fixture
/// nothing here asks a fact of.
fn repository() -> Arc<Mutex<Repository>> {
    static SHARED: OnceLock<(Fixture, Arc<Mutex<Repository>>)> = OnceLock::new();
    let (_home, repository) = SHARED.get_or_init(|| {
        let home = Fixture::new();
        let library = home.library();
        let repository = Arc::new(Mutex::new(library.repository));
        (home, repository)
    });
    Arc::clone(repository)
}

/// The body every plugin in these tests has: a module that answers an empty
/// `video.fields`, which is all a body has to do to be a body.
fn body() -> Vec<u8> {
    body_answering(&[])
}

/// The same body, answering these fields instead of nothing.
///
/// Written as text and compiled by the test, for the reason `super::wasm::fixture`
/// gives: `wasm32` is not a target this repository builds for, and a fixture
/// that needs another toolchain to have run first is a fixture that stops being
/// run. What the loader is handed is the bytes a directory holds, and this is
/// what those bytes are.
///
/// The answer is one `data` segment at a fixed offset and a `handle` that
/// returns it, so what a plugin says is the module itself — which is what makes
/// the order-sensitive test below a reading of the running instance rather than
/// of the fake it was built from.
fn body_answering(values: &[(&str, &str)]) -> Vec<u8> {
    let json = super::fixture::fields(values);
    // The answer is a WAT string literal, so its own quotes are escaped; the
    // length is the JSON's, before the escaping, because that is what the guest
    // hands back as the byte count.
    let text = json.replace('"', "\\\"");
    let length = json.len();
    wat::parse_str(format!(
        r#"
    (module
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (data (i32.const 2048) "{text}")
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (i64.const 2048)
        (i64.const 32)
        (i64.shl)
        (i64.const {length})
        (i64.or)))
"#
    ))
    .unwrap()
}

/// A manifest that declares a body module, on top of the one every plugin has.
fn with_body(id: &str) -> serde_json::Value {
    let mut manifest = manifest(id);
    manifest["body"] = serde_json::Value::String("body.wasm".to_string());
    manifest
}

/// A plugins directory with one plugin laid out in it, switched on.
///
/// `manifest` decides whether it is a plugin the kernel would accept; `bytes`
/// what its body module turns out to be. The enable record is written through
/// the store rather than by hand, because "the user switched it on" is what the
/// record means and the store is what writes it.
fn installed(directory: &Installed, id: &str, manifest: &serde_json::Value, bytes: &[u8]) -> Store {
    directory.plugin(id, manifest);
    directory.file(id, "body.wasm", bytes);
    let store = Store::new(directory.path().to_path_buf());
    store.set_enabled(id, true).unwrap();
    store
}

/// A host with nothing in its rotation, and the events it would report.
fn host() -> PluginHost {
    PluginHost::new(Arc::new(Recorded::default()))
}

#[test]
fn an_enabled_plugin_with_a_body_is_asked() {
    let directory = Installed::new();
    let store = installed(&directory, "one", &with_body("one"), &body());
    let host = host();

    loading::load(&store, &host, &repository());

    assert_eq!(host.enabled(), vec!["one".to_string()]);
}

#[test]
fn a_plugin_the_user_switched_off_is_not_asked() {
    let directory = Installed::new();
    let store = installed(&directory, "one", &with_body("one"), &body());
    store.set_enabled("one", false).unwrap();
    let host = host();

    loading::load(&store, &host, &repository());

    assert!(host.enabled().is_empty());
}

#[test]
fn a_plugin_with_only_an_interface_is_not_asked() {
    // Not a failure and not a line in the log: half a plugin is a plugin, and
    // the half this side runs is the one it does not have.
    let directory = Installed::new();
    directory.plugin("one", &manifest("one"));
    let store = Store::new(directory.path().to_path_buf());
    store.set_enabled("one", true).unwrap();
    let host = host();

    loading::load(&store, &host, &repository());

    assert!(host.enabled().is_empty());
}

#[test]
fn a_plugin_whose_manifest_does_not_validate_is_not_asked() {
    let directory = Installed::new();
    let mut broken = with_body("one");
    broken["apiVersion"] = serde_json::Value::from(super::manifest::API_VERSION + 1);
    let store = installed(&directory, "one", &broken, &body());
    let host = host();

    loading::load(&store, &host, &repository());

    assert!(host.enabled().is_empty());
}

#[test]
fn a_body_that_will_not_load_leaves_the_other_plugins_alone() {
    // The whole point of the loader being infallible: a plugin the kernel
    // cannot build is that plugin's problem, and the application starts.
    let directory = Installed::new();
    let store = installed(
        &directory,
        "broken",
        &with_body("broken"),
        b"not wasm at all",
    );
    directory.plugin("good", &with_body("good"));
    directory.file("good", "body.wasm", &body());
    store.set_enabled("good", true).unwrap();
    let host = host();

    loading::load(&store, &host, &repository());

    assert_eq!(host.enabled(), vec!["good".to_string()]);
}

#[test]
fn a_body_file_that_is_not_there_leaves_the_application_starting() {
    let directory = Installed::new();
    directory.plugin("one", &with_body("one"));
    let store = Store::new(directory.path().to_path_buf());
    store.set_enabled("one", true).unwrap();
    let host = host();

    loading::load(&store, &host, &repository());

    assert!(host.enabled().is_empty());
}

#[test]
fn a_plugins_directory_that_cannot_be_read_leaves_the_application_starting() {
    // A file where the plugins directory should be, which is the shortest way
    // to a directory that cannot be listed on every platform.
    let directory = Installed::new();
    let blocked = directory.path().join("not-a-directory");
    fs::write(&blocked, b"").unwrap();
    let host = host();

    loading::load(&Store::new(blocked), &host, &repository());

    assert!(host.enabled().is_empty());
}

#[test]
fn a_plugins_storage_directory_is_made_before_its_body_runs() {
    // `storage_write` is a write, not a make-then-write, so the directory has to
    // be there before the plugin's first call or the first call is the one that
    // fails.
    let directory = Installed::new();
    let store = installed(&directory, "one", &with_body("one"), &body());
    let host = host();

    loading::load(&store, &host, &repository());

    assert!(directory.path().join("one").join(loading::DATA).is_dir());
}

#[test]
fn a_plugin_is_asked_at_the_mount_point_the_catalog_names() {
    // The rotation is not the same thing as a working body: this is the one
    // test that goes through the whole path — directory, manifest, module,
    // instance, call — and reads the answer back out of the host.
    let directory = Installed::new();
    let store = installed(&directory, "one", &with_body("one"), &body());
    let host = host();

    loading::load(&store, &host, &repository());

    let fields = host.video_fields(&super::fixture::space(), &super::fixture::video());
    assert!(fields.is_empty());
}

#[test]
fn the_order_the_user_arranged_decides_which_plugin_fills_a_field() {
    // The acceptance criterion of the ordering story (User Story 20): two
    // plugins offering the same key, and the user putting the second one first.
    // `video.fields` takes the first non-empty answer, so the order is what
    // decides who wins — and the order is the user's, written down on disk and
    // applied when the window starts rather than being the order the directory
    // happens to list.
    let directory = Installed::new();
    let store = installed(
        &directory,
        "first",
        &with_body("first"),
        &body_answering(&[("cover", "/first.jpg")]),
    );
    directory.plugin("second", &with_body("second"));
    directory.file(
        "second",
        "body.wasm",
        &body_answering(&[("cover", "/second.jpg")]),
    );
    store.set_enabled("second", true).unwrap();
    store
        .set_order(&["second".to_string(), "first".to_string()])
        .unwrap();

    // Starting the window.
    let running = host();
    loading::load(&store, &running, &repository());

    let fields = running.video_fields(&super::fixture::space(), &super::fixture::video());
    assert_eq!(
        fields
            .iter()
            .map(|field| (
                field.key.as_str(),
                field.value.as_str(),
                field.source_plugin.as_str()
            ))
            .collect::<Vec<_>>(),
        vec![("cover", "/second.jpg", "second")],
        "the plugin the user put first is the one that fills the field"
    );

    // And again, in a window that has never seen the first one: the order is on
    // disk, so a restart is not a place it can be lost.
    let restarted = host();
    loading::load(&store, &restarted, &repository());
    let fields = restarted.video_fields(&super::fixture::space(), &super::fixture::video());
    assert_eq!(
        fields.first().map(|field| field.source_plugin.as_str()),
        Some("second"),
        "the order is still there the next time the window starts"
    );
}
