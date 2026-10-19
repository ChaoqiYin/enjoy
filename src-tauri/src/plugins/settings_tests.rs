//! The kernel's own work around a plugin's settings: the check a filled-in form
//! goes through, the shape the page is drawn from, and the one hand-over that
//! happens without the page being open.
//!
//! Every test here starts from the plugin's declaration — what it *asked* for —
//! and says what the kernel does with an answer to it. The bodies are the same
//! doubles the dispatch tests use, and the library is a real one: what a setting
//! is worth is decided against both.

use std::fs;

use crate::model::PluginSetting;
use crate::plugins::fixture::{self, FakeBody};
use crate::plugins::mount_points::{
    self, PluginSettingsParams, SettingField, SettingFieldKind, SettingValue,
};
use crate::plugins::settings::{self, PluginSettingsGroup};
use crate::repository::fixture::Fixture;
use crate::repository::Repository;

/// One thing a plugin asks the user to fill in.
fn field(key: &str, kind: SettingFieldKind, required: bool) -> SettingField {
    SettingField {
        key: key.to_string(),
        kind,
        label: key.to_string(),
        required,
    }
}

/// What the form sent back.
fn submitted(pairs: &[(&str, &str)]) -> Vec<SettingValue> {
    pairs
        .iter()
        .map(|(key, value)| SettingValue {
            key: (*key).to_string(),
            value: (*value).to_string(),
        })
        .collect()
}

/// What the kernel would write, as pairs, so a test reads as the form did.
fn pairs(values: &[PluginSetting]) -> Vec<(String, String)> {
    values
        .iter()
        .map(|setting| (setting.key.clone(), setting.value.clone()))
        .collect()
}

/// A library holding one plugin's settings.
fn library_with(plugin: &str, pairs: &[(&str, &str)]) -> Fixture {
    let fixture = Fixture::new();
    let mut repository = fixture.library().repository;
    repository
        .save_plugin_settings(
            plugin,
            &pairs
                .iter()
                .map(|(key, value)| PluginSetting {
                    key: (*key).to_string(),
                    value: (*value).to_string(),
                })
                .collect::<Vec<_>>(),
        )
        .unwrap();
    fixture
}

#[test]
fn what_the_user_filled_in_is_kept_for_the_fields_the_plugin_asked_for() {
    let declared = [
        field("url", SettingFieldKind::Text, true),
        field("notes", SettingFieldKind::Textarea, false),
    ];

    let kept = settings::check(
        "cover-fetcher",
        &declared,
        &submitted(&[
            ("notes", "one per line"),
            ("url", "https://a.example"),
            // A field the plugin no longer asks about: the declaration is the
            // plugin's and may change between one read and the next, so a stale
            // form is dropped rather than refused.
            ("gone", "something"),
        ]),
    )
    .unwrap();

    assert_eq!(
        pairs(&kept),
        vec![
            ("url".to_string(), "https://a.example".to_string()),
            ("notes".to_string(), "one per line".to_string()),
        ],
        "the declared fields, in the order the plugin declared them"
    );
}

#[test]
fn a_required_field_left_blank_is_refused_beside_that_field() {
    let declared = [
        field("url", SettingFieldKind::Text, true),
        field("notes", SettingFieldKind::Textarea, false),
    ];

    // Whitespace is blank: a field the user pressed space in is not filled in.
    let refusal = settings::check("cover-fetcher", &declared, &submitted(&[("url", "   ")])).unwrap_err();

    assert_eq!(refusal.code, "plugin.settings.required");
    assert_eq!(
        refusal.params.get("field").map(String::as_str),
        Some("url"),
        "the refusal names the field it is about, which is where the interface draws it"
    );
    assert_eq!(
        refusal.params.get("plugin").map(String::as_str),
        Some("cover-fetcher")
    );
}

#[test]
fn a_field_that_is_not_required_may_be_left_blank() {
    let declared = [
        field("url", SettingFieldKind::Text, false),
        field("notes", SettingFieldKind::Textarea, false),
    ];

    let kept = settings::check("cover-fetcher", &declared, &submitted(&[("url", "x")])).unwrap();

    assert_eq!(
        pairs(&kept),
        vec![
            ("url".to_string(), "x".to_string()),
            ("notes".to_string(), String::new()),
        ],
        "a blank answer is an answer, and the plugin is told it is blank"
    );
}

#[test]
fn a_directory_that_is_not_there_is_refused_beside_that_field() {
    let declared = [field("folder", SettingFieldKind::Directory, true)];

    let refusal = settings::check(
        "cover-fetcher",
        &declared,
        &submitted(&[("folder", "/nowhere/at/all")]),
    )
    .unwrap_err();

    assert_eq!(refusal.code, "plugin.settings.directory_missing");
    assert_eq!(
        refusal.params.get("field").map(String::as_str),
        Some("folder")
    );
}

#[test]
fn a_directory_that_is_there_is_kept_as_the_path_that_was_checked() {
    let fixture = Fixture::new();
    let folder = fixture.0.join("covers");
    fs::create_dir_all(&folder).unwrap();
    let declared = [field("folder", SettingFieldKind::Directory, true)];
    let given = folder.to_string_lossy().to_string();

    let kept = settings::check(
        "cover-fetcher",
        &declared,
        &submitted(&[("folder", &format!("  {given}  "))]),
    )
    .unwrap();

    assert_eq!(
        pairs(&kept),
        vec![("folder".to_string(), given)],
        "what is kept is the path that was checked, not the string that arrived"
    );
}

#[test]
fn a_directory_a_plugin_does_not_require_may_be_left_blank_but_not_wrong() {
    let declared = [field("folder", SettingFieldKind::Directory, false)];

    let kept = settings::check("cover-fetcher", &declared, &submitted(&[])).unwrap();
    assert_eq!(pairs(&kept), vec![("folder".to_string(), String::new())]);

    let refusal = settings::check(
        "cover-fetcher",
        &declared,
        &submitted(&[("folder", "/nowhere/at/all")]),
    )
    .unwrap_err();
    assert_eq!(
        refusal.code, "plugin.settings.directory_missing",
        "a folder that is not there is refused whether or not it was required"
    );
}

#[test]
fn a_toggle_is_kept_as_one_of_two_words() {
    let declared = [field("wanted", SettingFieldKind::Toggle, false)];

    let on = settings::check("cover-fetcher", &declared, &submitted(&[("wanted", "true")])).unwrap();
    let off = settings::check("cover-fetcher", &declared, &submitted(&[])).unwrap();

    assert_eq!(pairs(&on), vec![("wanted".to_string(), "true".to_string())]);
    assert_eq!(
        pairs(&off),
        vec![("wanted".to_string(), "false".to_string())],
        "the kernel drew a two-valued control, so it hands back one of two words"
    );
}

#[test]
fn what_was_saved_is_drawn_beside_the_field_it_belongs_to() {
    let group = settings::group(
        super::PluginSettings {
            plugin: "cover-fetcher".to_string(),
            fields: vec![
                field("url", SettingFieldKind::Text, true),
                field("notes", SettingFieldKind::Textarea, false),
            ],
        },
        &[PluginSetting {
            key: "url".to_string(),
            value: "https://a.example".to_string(),
        }],
    );

    let PluginSettingsGroup { plugin, fields } = group;
    assert_eq!(plugin, "cover-fetcher");
    assert_eq!(fields[0].value, "https://a.example");
    assert_eq!(fields[0].kind, SettingFieldKind::Text);
    assert_eq!(
        fields[1].value, "",
        "a field the user never filled in is drawn blank rather than left out"
    );
    assert_eq!(fields[1].label, "notes");
}

#[test]
fn a_plugin_with_saved_values_is_asked_with_them_when_the_application_starts() {
    let fixture = library_with("cover-fetcher", &[("url", "https://a.example")]);
    let repository = fixture.library().repository;
    let (host, _) = fixture::host();
    let body = FakeBody::answering(fixture::settings(&[(
        "url",
        SettingFieldKind::Text,
    )]));
    host.enable("cover-fetcher", body.clone());

    settings::hand_over(&host, &repository).unwrap();

    let params: PluginSettingsParams = body.params_of(mount_points::PLUGIN_SETTINGS, 0);
    assert_eq!(
        params
            .values
            .iter()
            .map(|value| (value.key.as_str(), value.value.as_str()))
            .collect::<Vec<_>>(),
        vec![("url", "https://a.example")],
        "the plugin is handed what the user filled in, which is the only way it can ever see it"
    );
}

#[test]
fn a_plugin_the_user_filled_nothing_in_for_is_not_asked_at_all() {
    let fixture = library_with("cover-fetcher", &[("url", "https://a.example")]);
    let repository = fixture.library().repository;
    let (host, _) = fixture::host();
    let asked = FakeBody::answering(fixture::settings(&[("url", SettingFieldKind::Text)]));
    let quiet = FakeBody::answering(fixture::settings(&[("url", SettingFieldKind::Text)]));
    host.enable("cover-fetcher", asked.clone());
    host.enable("never-filled-in", quiet.clone());

    settings::hand_over(&host, &repository).unwrap();

    assert_eq!(asked.asked_times(), 1);
    assert_eq!(
        quiet.asked_times(),
        0,
        "a plugin with nothing saved has nothing to be handed, and asking anyway would spend \
         one of its five failures on a question with no answer in it"
    );
}

#[test]
fn a_plugin_the_host_is_not_asking_is_left_alone() {
    let fixture = library_with("cover-fetcher", &[("url", "https://a.example")]);
    let repository = fixture.library().repository;
    let (host, _) = fixture::host();

    // Nothing enabled: the values are in the library and no plugin is running to
    // be handed them, which is not an error.
    settings::hand_over(&host, &repository).unwrap();

    assert_eq!(host.enabled(), Vec::<String>::new());
}

/// The other half of the round trip, in one place: a plugin answers with a
/// declaration, the kernel checks a form against it, writes it, and the plugin is
/// handed the result on the very next question — which is what the plugin page
/// does when the user presses save.
#[test]
fn a_saved_form_reaches_the_plugin_on_the_next_question() {
    let fixture = Fixture::new();
    let mut repository = fixture.library().repository;
    let declared = [field("url", SettingFieldKind::Text, true)];
    let values = settings::check(
        "cover-fetcher",
        &declared,
        &submitted(&[("url", "https://a.example")]),
    )
    .unwrap();
    repository
        .save_plugin_settings("cover-fetcher", &values)
        .unwrap();

    let (host, _) = fixture::host();
    let body = FakeBody::answering(fixture::settings(&[("url", SettingFieldKind::Text)]));
    host.enable("cover-fetcher", body.clone());
    let saved = settings::saved(&repository, &host.enabled()).unwrap();
    host.plugin_settings(&fixture::space(), &saved);

    let params: PluginSettingsParams = body.params_of(mount_points::PLUGIN_SETTINGS, 0);
    assert_eq!(params.values[0].value, "https://a.example");
}
