//! What the plugin does with each of the mount points it answers.

use serde_json::{json, Value};

use super::{CoverFetcher, Host, Response};

/// The params a `plugin.settings` call arrives with, and the values in them.
fn settings(values: Value) -> String {
    json!({ "space": { "id": 1 }, "values": values }).to_string()
}

/// The params a `video.fields` call arrives with.
fn fields(path: &str) -> String {
    json!({
        "space": { "id": 1 },
        "video": { "id": 7, "path": path },
        "fields": [],
    })
    .to_string()
}

/// A page that names the picture it wants for itself.
fn page(body: &str) -> Response {
    Response {
        status: 200,
        body: body.as_bytes().to_vec(),
    }
}

/// The kernel, as this plugin's own code sees it.
struct Fake {
    answers: Vec<Option<Response>>,
    asked: Vec<String>,
    notes: Vec<String>,
}

impl Fake {
    fn answering(answers: Vec<Option<Response>>) -> Self {
        Self {
            answers,
            asked: Vec::new(),
            notes: Vec::new(),
        }
    }
}

impl Host for Fake {
    fn get(&mut self, url: &str) -> Option<Response> {
        self.asked.push(url.to_string());
        if self.answers.is_empty() {
            return None;
        }
        self.answers.remove(0)
    }

    fn note(&mut self, line: &str) {
        self.notes.push(line.to_string());
    }
}

fn parsed(answer: &str) -> Value {
    serde_json::from_str(answer).expect("an answer a mount point can be given")
}

/// The whole of the plugin's half of a cover: a page it fetches, a picture the
/// page names, and the address handed back for the kernel to download.
#[test]
fn the_picture_the_page_names_is_the_address_the_kernel_is_handed() {
    let mut plugin = CoverFetcher::new();
    let mut host = Fake::answering(vec![Some(page(
        r#"<html><head><meta property="og:image" content="/covers/one.png"></head></html>"#,
    ))]);
    plugin.answer(
        "plugin.settings",
        &settings(json!([{ "key": "url", "value": "http://site.test/pages/{name}.html" }])),
        &mut host,
    );

    let answer = parsed(&plugin.answer("video.fields", &fields("/media/One.mp4"), &mut host));

    assert_eq!(
        host.asked,
        vec!["http://site.test/pages/One.html".to_string()]
    );
    assert_eq!(answer["fields"][0]["key"], "cover");
    assert_eq!(answer["fields"][0]["value"], "http://site.test/covers/one.png");
}

/// The setting is the plugin's own declaration of what it needs filled in, and
/// it is what the kernel draws the form from.
#[test]
fn the_setting_the_plugin_asks_for_is_the_url_it_fetches() {
    let mut plugin = CoverFetcher::new();
    let mut host = Fake::answering(vec![]);

    let answer = parsed(&plugin.answer("plugin.settings", &settings(json!([])), &mut host));

    assert_eq!(answer["fields"][0]["key"], "url");
    assert_eq!(answer["fields"][0]["kind"], "text");
    assert_eq!(answer["fields"][0]["required"], true);
}

/// A template with nothing to fill in is an address like any other.
#[test]
fn a_page_that_names_no_file_name_is_fetched_as_it_stands() {
    let mut plugin = CoverFetcher::new();
    let mut host = Fake::answering(vec![Some(page(r#"<img src="http://site.test/a.png">"#))]);
    plugin.answer(
        "plugin.settings",
        &settings(json!([{ "key": "url", "value": "http://site.test/one.html" }])),
        &mut host,
    );

    let answer = parsed(&plugin.answer("video.fields", &fields("/media/One.mp4"), &mut host));

    assert_eq!(host.asked, vec!["http://site.test/one.html".to_string()]);
    assert_eq!(answer["fields"][0]["value"], "http://site.test/a.png");
}

/// Before the user has filled anything in there is nothing to fetch, and a
/// plugin that asked anyway would be asking a site about a page it was never
/// told to look at.
#[test]
fn a_plugin_nothing_has_been_filled_in_for_asks_nothing_of_the_network() {
    let mut plugin = CoverFetcher::new();
    let mut host = Fake::answering(vec![]);

    let answer = parsed(&plugin.answer("video.fields", &fields("/media/One.mp4"), &mut host));

    assert!(host.asked.is_empty());
    assert!(answer["fields"].as_array().expect("a list").is_empty());
}

/// A page that is not there, a site that is down, a page with no picture on it:
/// all three are the same answer — this plugin has nothing to say about the
/// field, and the record keeps the picture it had (docs/插件系统.md §14.3).
#[test]
fn a_page_that_cannot_be_read_leaves_the_field_alone() {
    for answer in [None, Some(Response { status: 404, body: vec![] }), Some(page("<p>nothing</p>"))] {
        let mut plugin = CoverFetcher::new();
        let mut host = Fake::answering(vec![answer]);
        plugin.answer(
            "plugin.settings",
            &settings(json!([{ "key": "url", "value": "http://site.test/{name}.html" }])),
            &mut host,
        );

        let answer = parsed(&plugin.answer("video.fields", &fields("/media/One.mp4"), &mut host));

        assert!(answer["fields"].as_array().expect("a list").is_empty());
        assert!(!host.notes.is_empty(), "the plugin says why it said nothing");
    }
}

/// A `video.fields` call is answered with a list of fields even when the answer
/// is that there are none, and even when the call itself could not be read.
///
/// The kernel reads this mount point's answer as a list and a shape it cannot
/// read is a failed call — a strike against the plugin and a notification in
/// front of the user, for a plugin that did nothing but have nothing to say.
#[test]
fn a_fields_call_is_always_answered_with_a_list_of_fields() {
    let mut plugin = CoverFetcher::new();
    let mut host = Fake::answering(vec![]);

    for params in [fields("/media/One.mp4"), "not json at all".to_string()] {
        let answer = parsed(&plugin.answer("video.fields", &params, &mut host));
        assert_eq!(answer["fields"], json!([]), "for {params}");
    }
}

/// The menu item is what makes the kernel ask this plugin about this video, and
/// the field is the answer: there is nothing else for the action itself to say.
#[test]
fn the_menu_action_says_nothing_of_its_own() {
    let mut plugin = CoverFetcher::new();
    let mut host = Fake::answering(vec![]);

    let answer = parsed(&plugin.answer(
        "video.actions",
        &json!({ "space": { "id": 1 }, "video": { "id": 7, "path": "/media/One.mp4" } }).to_string(),
        &mut host,
    ));

    assert_eq!(answer, json!({}));
}
