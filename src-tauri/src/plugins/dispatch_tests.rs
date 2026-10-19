//! What a mount point does when several plugins contribute to it.
//!
//! The merge rules are the kernel's, not the plugins': who answers first is the
//! user's order (ADR 0045 §3), a field that nobody filled stays empty, and a
//! chain is asked in a sequence where each plugin can see what the ones before
//! it already said.

use crate::model::PluginSetting;
use crate::plugins::fixture::{self, FakeBody};
use crate::plugins::mount_points::{
    self, PluginSettingsParams, PluginSettingsResult, ScanCompletedParams, SettingField,
    SettingFieldKind, SourcedFieldValue, VideoActionsParams, VideoFieldsParams,
};

/// What a chain handed back, as the three facts a reader cares about.
fn answered(fields: &[SourcedFieldValue]) -> Vec<(String, String, String)> {
    fields
        .iter()
        .map(|field| {
            (
                field.key.clone(),
                field.value.clone(),
                field.source_plugin.clone(),
            )
        })
        .collect()
}

#[test]
fn the_first_plugin_with_a_value_wins_each_field() {
    let (host, _) = fixture::host();
    host.enable(
        "first",
        FakeBody::answering(fixture::fields(&[("cover", "/first.jpg")])),
    );
    host.enable(
        "second",
        FakeBody::answering(fixture::fields(&[
            ("cover", "/second.jpg"),
            ("rating", "5"),
        ])),
    );

    let fields = host.video_fields(&fixture::space(), &fixture::video());

    assert_eq!(
        answered(&fields),
        vec![
            ("cover".into(), "/first.jpg".into(), "first".into()),
            ("rating".into(), "5".into(), "second".into()),
        ]
    );
}

#[test]
fn a_plugin_that_found_nothing_leaves_the_field_for_the_next_one() {
    let (host, _) = fixture::host();
    host.enable(
        "first",
        FakeBody::answering(fixture::fields(&[("cover", "")])),
    );
    host.enable(
        "second",
        FakeBody::answering(fixture::fields(&[("cover", "/second.jpg")])),
    );

    let fields = host.video_fields(&fixture::space(), &fixture::video());

    assert_eq!(
        answered(&fields),
        vec![("cover".into(), "/second.jpg".into(), "second".into())]
    );
}

#[test]
fn a_plugin_is_asked_after_the_values_the_chain_already_has() {
    let (host, _) = fixture::host();
    let first = FakeBody::answering(fixture::fields(&[("cover", "/first.jpg")]));
    let second = FakeBody::answering(fixture::fields(&[]));
    host.enable("first", first);
    host.enable("second", second.clone());

    host.video_fields(&fixture::space(), &fixture::video());

    let params: VideoFieldsParams = second.params_of(mount_points::VIDEO_FIELDS, 0);
    assert_eq!(params.space.id, 1);
    assert_eq!(params.video.id, 7);
    assert_eq!(params.video.path, "/library/one.mp4");
    assert_eq!(
        answered(&params.fields),
        vec![("cover".into(), "/first.jpg".into(), "first".into())],
        "the plugin after the first is told what the first said, and who said it"
    );
}

#[test]
fn settings_are_grouped_by_the_plugin_that_gave_them() {
    let (host, _) = fixture::host();
    let one = serde_json::to_string(&PluginSettingsResult {
        fields: vec![SettingField {
            key: "url".to_string(),
            kind: SettingFieldKind::Text,
            label: "Site".to_string(),
            required: true,
        }],
    })
    .unwrap();
    let two = serde_json::to_string(&PluginSettingsResult {
        fields: vec![SettingField {
            key: "folder".to_string(),
            kind: SettingFieldKind::Directory,
            label: "Folder".to_string(),
            required: false,
        }],
    })
    .unwrap();
    host.enable("first", FakeBody::answering(one));
    host.enable("second", FakeBody::answering(two));

    let groups = host.plugin_settings(&fixture::space(), &[]);

    assert_eq!(
        groups
            .iter()
            .map(|group| (group.plugin.as_str(), group.fields[0].key.as_str()))
            .collect::<Vec<_>>(),
        vec![("first", "url"), ("second", "folder")],
        "one group per plugin, in the user's order"
    );
}

#[test]
fn each_plugin_is_asked_with_its_own_values_and_no_others() {
    let (host, _) = fixture::host();
    let first = FakeBody::answering(fixture::settings(&[("url", SettingFieldKind::Text)]));
    let second = FakeBody::answering(fixture::settings(&[("folder", SettingFieldKind::Directory)]));
    let third = FakeBody::answering(fixture::settings(&[("note", SettingFieldKind::Text)]));
    host.enable("first", first.clone());
    host.enable("second", second.clone());
    host.enable("third", third.clone());

    host.plugin_settings(
        &fixture::space(),
        &[
            ("first".to_string(), vec![setting("url", "https://a.example")]),
            ("second".to_string(), vec![setting("folder", "/library")]),
        ],
    );

    let said = |body: &FakeBody| {
        body.params_of::<PluginSettingsParams>(mount_points::PLUGIN_SETTINGS, 0)
            .values
            .into_iter()
            .map(|value| value.value)
            .collect::<Vec<_>>()
    };
    assert_eq!(said(&first), vec!["https://a.example".to_string()]);
    assert_eq!(said(&second), vec!["/library".to_string()]);
    assert_eq!(
        said(&third),
        Vec::<String>::new(),
        "a plugin with nothing saved is still asked, with nothing: the values are part of the \
         question rather than an event of their own"
    );
}

/// One saved value, as the library hands it over.
fn setting(key: &str, value: &str) -> PluginSetting {
    PluginSetting {
        key: key.to_string(),
        value: value.to_string(),
    }
}

#[test]
fn a_plugin_with_nothing_to_ask_for_gets_no_group() {
    let (host, _) = fixture::host();
    host.enable("quiet", FakeBody::answering(fixture::settings(&[])));
    host.enable(
        "asking",
        FakeBody::answering(fixture::settings(&[("url", SettingFieldKind::Text)])),
    );

    let groups = host.plugin_settings(&fixture::space(), &[]);

    assert_eq!(
        groups
            .iter()
            .map(|group| (group.plugin.as_str(), group.fields[0].key.as_str()))
            .collect::<Vec<_>>(),
        vec![("asking", "url")],
        "a plugin with nothing to fill in is not drawn as a section with nothing in it"
    );
}

#[test]
fn every_plugin_is_told_when_a_scan_finishes() {
    let (host, _) = fixture::host();
    let first = FakeBody::answering("{}");
    let second = FakeBody::answering("{}");
    host.enable("first", first.clone());
    host.enable("second", second.clone());

    host.scan_completed(&fixture::space(), &[fixture::video()]);

    for body in [&first, &second] {
        let params: ScanCompletedParams = body.params_of(mount_points::SCAN_COMPLETED, 0);
        assert_eq!(params.space.id, 1);
        assert_eq!(params.videos.len(), 1);
        assert_eq!(params.videos[0].id, 7);
    }
}

#[test]
fn an_action_goes_to_the_plugin_whose_item_was_chosen_and_no_other() {
    // One manifest is one menu item, so choosing an item is a question put to
    // one plugin. A second plugin that also offers an action has offered a
    // second item, and this is not it.
    let (host, _) = fixture::host();
    let chosen = FakeBody::answering("{}");
    let other = FakeBody::answering("{}");
    host.enable("chosen", chosen.clone());
    host.enable("other", other.clone());

    host.video_action("chosen", &fixture::space(), &fixture::video());

    assert_eq!(
        chosen
            .asked()
            .iter()
            .map(|(method, _)| method.clone())
            .collect::<Vec<_>>(),
        vec![mount_points::VIDEO_ACTIONS.to_string()]
    );
    let params: VideoActionsParams = chosen.params_of(mount_points::VIDEO_ACTIONS, 0);
    assert_eq!(params.space.id, 1);
    assert_eq!(params.video.id, 7);
    assert_eq!(
        other.asked_times(),
        0,
        "a plugin whose item was not chosen is not told about the click"
    );
}

#[test]
fn an_action_for_a_plugin_that_is_not_being_asked_does_nothing() {
    // The menu is drawn from the manifest on disk; the rotation is what the
    // running window asks. The two can disagree — a plugin switched off since
    // the window opened — and the disagreement is a menu item that quietly
    // does nothing rather than a call to a plugin that is not there.
    let (host, told) = fixture::host();
    let body = FakeBody::answering("{}");
    host.enable("one", body.clone());
    host.disable("one");

    host.video_action("one", &fixture::space(), &fixture::video());
    host.video_action("never-installed", &fixture::space(), &fixture::video());

    assert_eq!(body.asked_times(), 0);
    assert!(told.plugin_failures().is_empty());
}

#[test]
fn the_order_the_user_arranges_is_the_order_the_plugins_answer_in() {
    let (host, _) = fixture::host();
    host.enable(
        "first",
        FakeBody::answering(fixture::fields(&[("cover", "/first.jpg")])),
    );
    host.enable(
        "second",
        FakeBody::answering(fixture::fields(&[("cover", "/second.jpg")])),
    );

    host.reorder(&["second".to_string(), "first".to_string()]);
    let fields = host.video_fields(&fixture::space(), &fixture::video());

    assert_eq!(
        answered(&fields),
        vec![("cover".into(), "/second.jpg".into(), "second".into())],
        "the user moved second in front, so second is the one that answers"
    );
}

#[test]
fn switching_a_plugin_off_keeps_its_place_in_the_order() {
    let (host, _) = fixture::host();
    for id in ["first", "second", "third"] {
        host.enable(id, FakeBody::answering(fixture::fields(&[])));
    }

    host.disable("second");
    assert_eq!(host.enabled(), vec!["first", "third"]);

    host.enable("second", FakeBody::answering(fixture::fields(&[])));
    assert_eq!(
        host.enabled(),
        vec!["first", "second", "third"],
        "a plugin switched off and back on is where the user left it"
    );
}

#[test]
fn a_plugin_that_is_switched_off_is_not_asked() {
    let (host, _) = fixture::host();
    let first = FakeBody::answering(fixture::fields(&[("cover", "/first.jpg")]));
    let second = FakeBody::answering(fixture::fields(&[("cover", "/second.jpg")]));
    host.enable("first", first.clone());
    host.enable("second", second.clone());

    host.disable("first");
    let fields = host.video_fields(&fixture::space(), &fixture::video());

    assert_eq!(first.asked_times(), 0);
    assert_eq!(second.asked_times(), 1);
    assert_eq!(
        answered(&fields),
        vec![("cover".into(), "/second.jpg".into(), "second".into())]
    );
}

#[test]
fn a_plugin_the_host_has_never_heard_of_is_not_the_end_of_the_order() {
    let (host, _) = fixture::host();
    host.enable("known", FakeBody::answering(fixture::fields(&[])));

    host.reorder(&["gone".to_string(), "known".to_string()]);

    assert_eq!(
        host.enabled(),
        vec!["known"],
        "an order written before a plugin was uninstalled still leaves the rest in place"
    );
}
