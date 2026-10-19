//! The plugin page's settings form, from the two ends the interface has: what
//! the page is drawn from, and what pressing save does.
//!
//! The pieces are tested where they live — the check and the hand-over in
//! `plugins::settings`, the grouping in `plugins::dispatch`, the rows in
//! `repository::plugin_settings`. What is asked here is the half this module
//! owns: that reading gives the page one group per plugin with the user's values
//! already in it, that saving writes the checked form and answers with the same
//! shape reading does, that a refusal reaches the user without anything being
//! written, and that the plugin is handed the new values in the same call that
//! saved them.

use crate::app::{test_state, AppState};
use crate::plugins::fixture::{self, FakeBody};
use crate::plugins::mount_points::{
    self, PluginSettingsParams, PluginSettingsResult, SettingField, SettingFieldKind,
    SettingValue,
};
use crate::plugins::PluginSettingsGroup;
use crate::repository::fixture::Fixture;
use crate::repository::lock_shared;

use super::plugin_settings::{save, settings};

/// The JSON a body answers `plugin.settings` with, `required` and all — which is
/// the one thing the shared helper cannot say, and the thing half of these tests
/// are about.
fn declaration(fields: &[(&str, SettingFieldKind, bool)]) -> String {
    serde_json::to_string(&PluginSettingsResult {
        fields: fields
            .iter()
            .map(|(key, kind, required)| SettingField {
                key: (*key).to_string(),
                kind: *kind,
                label: key.to_string(),
                required: *required,
            })
            .collect(),
    })
    .unwrap()
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

/// The state, the space, and the one plugin in it that asks for a URL and a
/// folder.
fn state_asking() -> (Fixture, AppState, i64, std::sync::Arc<FakeBody>) {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let space = lock_shared(&state.repository)
        .unwrap()
        .current_space()
        .unwrap()
        .id;
    let body = FakeBody::answering(declaration(&[
        ("url", SettingFieldKind::Text, true),
        ("folder", SettingFieldKind::Directory, false),
    ]));
    state.plugins.enable("cover-fetcher", body.clone());
    (fixture, state, space, body)
}

/// What the library holds for one plugin, as pairs.
fn kept(state: &AppState, plugin: &str) -> Vec<(String, String)> {
    lock_shared(&state.repository)
        .unwrap()
        .plugin_settings(plugin)
        .unwrap()
        .into_iter()
        .map(|setting| (setting.key, setting.value))
        .collect()
}

/// The one group in an answer, so that a test reads as the page does.
fn only(groups: &[PluginSettingsGroup]) -> &PluginSettingsGroup {
    assert_eq!(groups.len(), 1, "one plugin was asked, so one group comes back");
    &groups[0]
}

#[test]
fn the_page_is_drawn_from_what_the_plugin_asked_for_and_what_the_user_filled_in() {
    let (fixture, state, space, _) = state_asking();
    let mut repository = lock_shared(&state.repository).unwrap();
    repository
        .save_plugin_settings(
            "cover-fetcher",
            &[crate::model::PluginSetting {
                key: "url".to_string(),
                value: "https://a.example".to_string(),
            }],
        )
        .unwrap();
    drop(repository);

    let groups = settings(&state, space).unwrap();

    let group = only(&groups);
    assert_eq!(group.plugin, "cover-fetcher");
    let drawn: Vec<(&str, SettingFieldKind, bool, &str)> = group
        .fields
        .iter()
        .map(|field| {
            (
                field.key.as_str(),
                field.kind,
                field.required,
                field.value.as_str(),
            )
        })
        .collect();
    assert_eq!(
        drawn,
        vec![
            ("url", SettingFieldKind::Text, true, "https://a.example"),
            ("folder", SettingFieldKind::Directory, false, ""),
        ],
        "each field is what the plugin asked for, with the user's answer in it and a blank \
         where there is none"
    );
    drop(fixture);
}

#[test]
fn a_plugin_that_asks_for_nothing_is_not_drawn_as_an_empty_section() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let space = lock_shared(&state.repository)
        .unwrap()
        .current_space()
        .unwrap()
        .id;
    state
        .plugins
        .enable("quiet", FakeBody::answering(fixture::settings(&[])));
    state.plugins.enable(
        "asking",
        FakeBody::answering(fixture::settings(&[("url", SettingFieldKind::Text)])),
    );

    let groups = settings(&state, space).unwrap();

    assert_eq!(
        groups
            .iter()
            .map(|group| group.plugin.as_str())
            .collect::<Vec<_>>(),
        vec!["asking"]
    );
    drop(fixture);
}

#[test]
fn the_space_the_user_is_looking_at_is_the_space_the_plugin_is_told() {
    let (fixture, state, _, body) = state_asking();

    settings(&state, 42).unwrap();

    let params: PluginSettingsParams = body.params_of(mount_points::PLUGIN_SETTINGS, 0);
    assert_eq!(
        params.space.id, 42,
        "the space travels with the question even though what is stored does not depend on it"
    );
    drop(fixture);
}

#[test]
fn saving_writes_the_form_and_answers_with_every_group_as_it_now_stands() {
    let (fixture, state, space, _) = state_asking();

    let groups = save(
        &state,
        space,
        "cover-fetcher",
        &submitted(&[("url", "https://a.example"), ("folder", "")]),
    )
    .unwrap();

    assert_eq!(only(&groups).fields[0].value, "https://a.example");
    assert_eq!(
        kept(&state, "cover-fetcher"),
        // By key, which is how the library reads its rows back; what the page
        // draws is the declaration's order, which is what the assertion above is
        // about.
        vec![
            ("folder".to_string(), String::new()),
            ("url".to_string(), "https://a.example".to_string()),
        ],
        "the answer to saving is the same shape as the answer to reading, and both come from the \
         library"
    );
    drop(fixture);
}

#[test]
fn a_refused_form_is_written_nowhere() {
    let (fixture, state, space, _) = state_asking();

    let refusal = save(
        &state,
        space,
        "cover-fetcher",
        &submitted(&[("url", "   "), ("folder", "")]),
    )
    .unwrap_err();

    assert_eq!(refusal.code, "plugin.settings.required");
    assert_eq!(
        refusal.params.get("field").map(String::as_str),
        Some("url"),
        "the refusal says which field it is about, which is where the page draws it"
    );
    assert_eq!(
        kept(&state, "cover-fetcher"),
        Vec::<(String, String)>::new(),
        "a form that was refused leaves the library exactly as it was"
    );
    drop(fixture);
}

#[test]
fn the_form_is_checked_against_the_declaration_the_plugin_gave_for_the_values_it_was_handed() {
    // A plugin may ask for more once it has been given something — here, a token
    // once advanced mode is on. What the user's answers are checked against is
    // the declaration that was drawn for the form they were looking at, which is
    // the one the plugin gave for the values it had been handed; the values that
    // just arrived are the answer to that question, not a new one.
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let space = lock_shared(&state.repository)
        .unwrap()
        .current_space()
        .unwrap()
        .id;
    let body = FakeBody::doing(|_, payload| {
        let params: PluginSettingsParams = serde_json::from_str(payload).unwrap();
        let advanced = params
            .values
            .iter()
            .any(|value| value.key == "mode" && value.value == "advanced");
        Ok(if advanced {
            declaration(&[("token", SettingFieldKind::Text, true)])
        } else {
            declaration(&[("mode", SettingFieldKind::Text, false)])
        })
    });
    state.plugins.enable("asking", body);
    lock_shared(&state.repository)
        .unwrap()
        .save_plugin_settings(
            "asking",
            &[crate::model::PluginSetting {
                key: "mode".to_string(),
                value: "advanced".to_string(),
            }],
        )
        .unwrap();

    let refusal = save(
        &state,
        space,
        "asking",
        &submitted(&[("mode", "simple"), ("token", "")]),
    )
    .unwrap_err();

    assert_eq!(
        refusal.params.get("field").map(String::as_str),
        Some("token"),
        "checked against the declaration the plugin gave for the values it was handed, not \
         against one drawn for the values that just arrived"
    );
    drop(fixture);
}

#[test]
fn a_plugin_the_window_is_not_asking_cannot_be_saved_for() {
    let (fixture, state, space, _) = state_asking();
    state.plugins.disable("cover-fetcher");

    let refusal = save(
        &state,
        space,
        "cover-fetcher",
        &submitted(&[("url", "https://a.example")]),
    )
    .unwrap_err();

    assert_eq!(refusal.code, "plugin.settings.unavailable");
    assert_eq!(
        refusal.params.get("plugin").map(String::as_str),
        Some("cover-fetcher")
    );
    assert_eq!(
        kept(&state, "cover-fetcher"),
        Vec::<(String, String)>::new(),
        "the library keeps no answers to a question nobody put"
    );
    drop(fixture);
}

#[test]
fn what_was_saved_reaches_the_plugin_in_the_same_call_that_saves_it() {
    let (fixture, state, space, body) = state_asking();

    save(
        &state,
        space,
        "cover-fetcher",
        &submitted(&[("url", "https://a.example"), ("folder", "")]),
    )
    .unwrap();

    // The first question is the one whose declaration the form was checked
    // against; the second is the redraw, and it is also the hand-over.
    let params: PluginSettingsParams = body.params_of(mount_points::PLUGIN_SETTINGS, 1);
    assert_eq!(
        params
            .values
            .iter()
            .map(|value| (value.key.as_str(), value.value.as_str()))
            .collect::<Vec<_>>(),
        vec![("folder", ""), ("url", "https://a.example")],
        "the plugin is handed what the user just saved, without a second command to push it"
    );
    drop(fixture);
}
