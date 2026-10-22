//! What a finished task leaves in the library, and what the chain does to it.
//!
//! `land_now` is driven directly rather than through `FieldLanding::spawn`:
//! the thread is the part with no rule in it, and a test that waited on one
//! would be a test about timing. What is asserted is the library after the
//! five steps and the one event they send.

use std::sync::{Arc, Mutex};

use crate::events::Recorded;
use crate::model::VideoField;
use crate::plugins::fixture::{fields, host};
use crate::repository::fixture::{video_fields, Fixture, Library};

use super::landing::land_now;

const PLUGIN: &str = "com.example.one";
const VIDEO: i64 = 7;

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

#[test]
fn a_finished_tasks_fields_land_with_the_plugin_as_their_source() {
    let home = Fixture::new();
    let Library {
        mut repository,
        space,
    } = home.library();
    // A record to hang the fields off, and a value another plugin wrote that
    // this one is about to replace.
    video_fields(
        &mut repository,
        &[(VIDEO, "title", "old", "com.example.old")],
    );
    let id = repository
        .push_task(Some(PLUGIN), space, Some(VIDEO), "scrape", "{}")
        .unwrap();
    let task = repository.task(id).unwrap();
    let repository = Arc::new(Mutex::new(repository));
    let events = Arc::new(Recorded::default());
    let covers = home.0.join("covers");

    land_now(
        &repository,
        &covers,
        events.as_ref(),
        None,
        &runtime(),
        &task,
        vec![VideoField {
            key: "title".to_string(),
            value: "found".to_string(),
            source_plugin: PLUGIN.to_string(),
        }],
    )
    .unwrap();

    let landed = repository.lock().unwrap().fields(VIDEO).unwrap();
    assert_eq!(landed.len(), 1);
    assert_eq!(landed[0].key, "title");
    assert_eq!(landed[0].value, "found");
    assert_eq!(landed[0].source_plugin, PLUGIN);
    assert_eq!(
        events
            .library_changes
            .load(std::sync::atomic::Ordering::SeqCst),
        1
    );
}

#[test]
fn the_chain_is_asked_again_so_an_earlier_plugin_has_the_last_word() {
    let home = Fixture::new();
    let Library {
        mut repository,
        space,
    } = home.library();
    video_fields(
        &mut repository,
        &[(VIDEO, "title", "old", "com.example.old")],
    );
    let id = repository
        .push_task(Some(PLUGIN), space, Some(VIDEO), "scrape", "{}")
        .unwrap();
    let task = repository.task(id).unwrap();
    let repository = Arc::new(Mutex::new(repository));
    let (host, events) = host();
    // A plugin the user has put ahead of the one that just finished: its
    // answer is the one step 4 must leave in the library.
    let ahead: Arc<dyn crate::plugins::Runner> =
        crate::plugins::fixture::FakeBody::answering(fields(&[("title", "ahead")]));
    host.enable("com.example.ahead", ahead);

    land_now(
        &repository,
        &home.0.join("covers"),
        events.as_ref(),
        Some(&host),
        &runtime(),
        &task,
        vec![VideoField {
            key: "title".to_string(),
            value: "from the finished task".to_string(),
            source_plugin: PLUGIN.to_string(),
        }],
    )
    .unwrap();

    let landed = repository.lock().unwrap().fields(VIDEO).unwrap();
    assert_eq!(landed.len(), 1);
    assert_eq!(landed[0].key, "title");
    assert_eq!(landed[0].value, "ahead");
    assert_eq!(landed[0].source_plugin, "com.example.ahead");
}

#[test]
fn a_task_without_a_video_lands_nothing_and_says_so() {
    let home = Fixture::new();
    let Library {
        mut repository,
        space,
    } = home.library();
    let id = repository
        .push_task(Some(PLUGIN), space, None, "clean-up", "{}")
        .unwrap();
    let task = repository.task(id).unwrap();
    let repository = Arc::new(Mutex::new(repository));
    let events = Arc::new(Recorded::default());

    land_now(
        &repository,
        &home.0.join("covers"),
        events.as_ref(),
        None,
        &runtime(),
        &task,
        vec![VideoField {
            key: "title".to_string(),
            value: "nowhere".to_string(),
            source_plugin: PLUGIN.to_string(),
        }],
    )
    .unwrap();

    assert_eq!(
        events
            .library_changes
            .load(std::sync::atomic::Ordering::SeqCst),
        0
    );
}
