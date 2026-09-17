use tauri_plugin_updater::Config;

/// The bundled configuration has to survive the plugin's own deserialization.
///
/// A missing `plugins.updater` block reaches the plugin as `null` and fails its
/// initialization, which stops the application from starting at all. Nothing
/// catches that earlier: the plugin configuration stays opaque JSON until
/// runtime, so a broken edit compiles cleanly and only shows up as an app that
/// will not open. This test is what turns that into a failing check instead.
#[test]
fn the_bundled_updater_config_deserializes() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json");
    let raw = std::fs::read_to_string(path).expect("the Tauri configuration is readable");
    let config: serde_json::Value =
        serde_json::from_str(&raw).expect("the Tauri configuration is valid JSON");
    let section = config
        .get("plugins")
        .and_then(|plugins| plugins.get("updater"))
        .cloned()
        .expect("tauri.conf.json declares plugins.updater");
    let updater: Config =
        serde_json::from_value(section).expect("plugins.updater matches the updater schema");

    assert!(!updater.pubkey.is_empty(), "the updater public key is set");
    assert!(
        !updater.endpoints.is_empty(),
        "at least one update endpoint is configured"
    );
    // Release builds reject a non-https endpoint during deserialization, so the
    // check is repeated here where it fails as a test rather than as a crash.
    for endpoint in &updater.endpoints {
        assert_eq!(
            endpoint.scheme(),
            "https",
            "update endpoints must use https"
        );
    }
    assert!(
        updater.windows.is_some(),
        "the Windows install mode is configured"
    );
}
