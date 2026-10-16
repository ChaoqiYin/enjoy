//! What a refresh puts in the library, and what it reads back out.
//!
//! The chain's own rules — who answers first, what an empty answer means — are
//! the dispatch's and are tested beside it, and what the kernel does with a
//! cover's address is `plugins::cover`'s. What is asked here is the half this
//! command owns: that the answer reaches the table with the plugin that gave it,
//! that the user's order is what decides the winner, that the source stays
//! readable once the plugin is no longer being asked, and that the two errands
//! the interface has — open the details, and pick an action out of the menu —
//! leave the library in the state the panel is about to draw.

use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Barrier};

use super::fields::{refresh_fields, run_plugin_action};
use crate::app::{test_state, AppState};
use crate::model::VideoField;
use crate::plugins::fixture::{self, FakeBody};
use crate::plugins::mount_points;
use crate::repository::fixture::Fixture;
use crate::repository::lock_shared;
use crate::scan::scanner;

/// What a refresh answered, as the triple each field is: the key, the value, and
/// the plugin the value came from.
fn triples(fields: &[VideoField]) -> Vec<(&str, &str, &str)> {
    fields
        .iter()
        .map(|field| {
            (
                field.key.as_str(),
                field.value.as_str(),
                field.source_plugin.as_str(),
            )
        })
        .collect()
}

/// A state holding one record, and what a caller needs to name it: the space it
/// is in, and its path.
fn state_with_one_record() -> (Fixture, AppState, i64, String) {
    let fixture = Fixture::new();
    let movie = fixture.0.join("clip.mp4");
    fs::write(&movie, b"content").unwrap();
    let state = test_state(&fixture);
    let root = fixture.0.to_string_lossy().into_owned();
    let files = scanner::collect(&fixture.0).unwrap();
    let mut repository = lock_shared(&state.repository).unwrap();
    let space = repository.current_space().unwrap().id;
    repository.index(space, &root, &files).unwrap();
    drop(repository);
    let path = movie.to_string_lossy().into_owned();
    (fixture, state, space, path)
}

/// What the library holds for one path, read the way anything that is not a
/// refresh reads it — so that a field the command answered about is also a field
/// the rest of the kernel can find.
fn stored(state: &AppState, space: i64, path: &str) -> Vec<VideoField> {
    let repository = lock_shared(&state.repository).unwrap();
    let id = repository.video_id(space, path).unwrap();
    repository.fields(id).unwrap()
}

/// A body that answers the chain with these fields and nothing anywhere else.
///
/// What a cover plugin is: `video.fields` is where it hands back what it found,
/// and `video.actions` is the errand that goes and finds it — a call it answers
/// with the catalog's empty result, because an action's answer is not where a
/// contribution goes.
fn offering(values: &[(&str, &str)]) -> Arc<FakeBody> {
    let fields = fixture::fields(values);
    FakeBody::doing(move |method, _| {
        if method == mount_points::VIDEO_FIELDS {
            Ok(fields.clone())
        } else {
            Ok("{}".to_string())
        }
    })
}

/// The cover's value, as the two things about it a reader cares about: that it
/// is inside the covers directory, and what is in the file it names.
fn landed(fields: &[VideoField], state: &AppState) -> (PathBuf, Vec<u8>) {
    let value = fields
        .iter()
        .find(|field| field.key == "cover")
        .expect("a cover")
        .value
        .clone();
    let path = PathBuf::from(&value);
    assert!(
        path.starts_with(&state.covers),
        "the library holds a path under the covers directory, which is the one \
         place the window can draw from: {}",
        path.display()
    );
    let bytes = fs::read(&path).expect("the picture the address named");
    (path, bytes)
}

#[tokio::test]
async fn what_the_chain_answered_is_stored_under_the_plugin_that_gave_it() {
    let (_fixture, state, space, path) = state_with_one_record();
    state.plugins.enable(
        "cover-fetcher",
        FakeBody::answering(fixture::fields(&[("cover", "/covers/1.jpg")])),
    );

    let answered = refresh_fields(&state, space, &path).await.unwrap();
    assert_eq!(
        triples(&answered),
        [("cover", "/covers/1.jpg", "cover-fetcher")]
    );
    // Written down, not only answered: a panel opened afterwards reads the row
    // rather than asking the plugins again, and the source has to travel with
    // the value for it to be able to say where the cover came from.
    assert_eq!(
        triples(&stored(&state, space, &path)),
        [("cover", "/covers/1.jpg", "cover-fetcher")]
    );
}

#[tokio::test]
async fn the_order_the_user_arranged_decides_which_plugin_wins_a_field() {
    let (_fixture, state, space, path) = state_with_one_record();
    state.plugins.enable(
        "cover-fetcher",
        FakeBody::answering(fixture::fields(&[("cover", "/covers/1.jpg")])),
    );
    state.plugins.enable(
        "other-fetcher",
        FakeBody::answering(fixture::fields(&[("cover", "/covers/2.jpg")])),
    );

    // Both plugins offer a cover, and the chain takes the first non-empty answer
    // — so the winner is decided by the order and by nothing else. Which order
    // that is, is the user's to arrange (User Story 20).
    assert_eq!(
        triples(&refresh_fields(&state, space, &path).await.unwrap()),
        [("cover", "/covers/1.jpg", "cover-fetcher")]
    );

    state
        .plugins
        .reorder(&["other-fetcher".to_string(), "cover-fetcher".to_string()]);

    // The same two plugins, the same field, the other order — and the record now
    // carries the other cover, from the other plugin. That the stored row moved
    // with the order is the point: a refresh writes what the chain answered, so
    // reordering is enough and no one has to go and edit the field.
    assert_eq!(
        triples(&refresh_fields(&state, space, &path).await.unwrap()),
        [("cover", "/covers/2.jpg", "other-fetcher")]
    );
    assert_eq!(
        triples(&stored(&state, space, &path)),
        [("cover", "/covers/2.jpg", "other-fetcher")]
    );
}

#[tokio::test]
async fn a_field_stays_readable_after_the_plugin_that_wrote_it_stops_being_asked() {
    let (_fixture, state, space, path) = state_with_one_record();
    let body = FakeBody::answering(fixture::fields(&[("cover", "/covers/1.jpg")]));
    state.plugins.enable("cover-fetcher", body.clone());
    refresh_fields(&state, space, &path).await.unwrap();

    // Disabled, which is what an uninstalled plugin looks like from here: the
    // host no longer asks it, and nothing else about it is known. Its id is a
    // bare string in the row rather than a reference to a plugin that exists,
    // which is what lets the source still be readable (ADR 0045 §3, User Story
    // 10) — the value the user chose to keep does not become anonymous.
    state.plugins.disable("cover-fetcher");
    let answered = refresh_fields(&state, space, &path).await.unwrap();

    assert_eq!(body.asked_times(), 1);
    assert_eq!(
        triples(&answered),
        [("cover", "/covers/1.jpg", "cover-fetcher")]
    );
}

#[tokio::test]
async fn a_plugin_that_failed_does_not_keep_the_next_one_out() {
    let (_fixture, state, space, path) = state_with_one_record();
    state.plugins.enable("broken", FakeBody::failing());
    state.plugins.enable(
        "cover-fetcher",
        FakeBody::answering(fixture::fields(&[("cover", "/covers/1.jpg")])),
    );

    // A plugin that throws has said nothing and the chain goes on (ADR 0043 §5).
    // The field is stored from the plugin that answered, which is what makes a
    // broken plugin a broken plugin rather than a broken library.
    assert_eq!(
        triples(&refresh_fields(&state, space, &path).await.unwrap()),
        [("cover", "/covers/1.jpg", "cover-fetcher")]
    );
}

#[tokio::test]
async fn a_path_this_library_does_not_hold_is_never_put_to_a_plugin() {
    let (_fixture, state, space, _path) = state_with_one_record();
    let body = FakeBody::answering(fixture::fields(&[("cover", "/covers/1.jpg")]));
    state.plugins.enable("cover-fetcher", body.clone());

    let error = refresh_fields(&state, space, "/library/nowhere.mp4")
        .await
        .unwrap_err();

    // Refused before anything was asked: a field belongs to a record, and a
    // plugin asked about a file that is not in the library would be asked about
    // a record that does not exist.
    assert_eq!(error.code, "media.file.not_found");
    assert_eq!(body.asked_times(), 0);
}

#[tokio::test]
async fn a_cover_a_plugin_answered_with_as_an_address_is_stored_as_a_path() {
    let (_fixture, state, space, path) = state_with_one_record();
    let address = fixture::serving("200 OK", "Content-Type: image/jpeg\r\n", b"a picture");
    state
        .plugins
        .enable("cover-fetcher", offering(&[("cover", &address)]));

    let answered = refresh_fields(&state, space, &path).await.unwrap();

    // The plugin's half of a cover is finding the address and the kernel's half
    // is going and getting it, so what the panel reads is a path and the file
    // behind it is on this machine. A value that stayed an address would be a
    // picture the window has no way to draw.
    let (landed, bytes) = landed(&answered, &state);
    assert_eq!(bytes, b"a picture");
    assert_eq!(landed.file_name().unwrap(), "1.jpg");
    assert_eq!(
        triples(&stored(&state, space, &path))[0].1,
        landed.to_string_lossy(),
        "and the row holds the path rather than the address"
    );
}

#[tokio::test]
async fn a_cover_that_did_not_arrive_leaves_the_one_the_record_had() {
    let (_fixture, state, space, path) = state_with_one_record();
    let good = fixture::serving("200 OK", "Content-Type: image/png\r\n", b"the first");
    state
        .plugins
        .enable("cover-fetcher", offering(&[("cover", &good)]));
    let first = refresh_fields(&state, space, &path).await.unwrap();
    let (landed, _) = landed(&first, &state);

    // The same plugin, now pointing at a site that answers nothing: what a
    // plugin does when the site it scrapes goes down, which is the ordinary
    // weather of a scraper and not a fault of its own.
    let dead = fixture::serving("500 Server Error", "", b"");
    state.plugins.disable("cover-fetcher");
    state
        .plugins
        .enable("cover-fetcher", offering(&[("cover", &dead)]));
    let again = refresh_fields(&state, space, &path).await.unwrap();

    // The record keeps the picture it had. Storing the address instead would
    // draw a broken picture where the user had a good one, and dropping the
    // field would take away a picture the plugin did find, for a reason that is
    // about today's weather.
    assert_eq!(triples(&again), triples(&first));
    assert_eq!(again[0].value, landed.to_string_lossy());
    assert!(landed.exists());
}

#[tokio::test]
async fn an_action_is_run_for_the_plugin_the_user_chose_and_the_fields_come_back() {
    let (_fixture, state, space, path) = state_with_one_record();
    let address = fixture::serving("200 OK", "Content-Type: image/png\r\n", b"a picture");
    let chosen = offering(&[("cover", &address)]);
    let other = offering(&[("cover", "/covers/other.jpg")]);
    state.plugins.enable("cover-fetcher", chosen.clone());
    state.plugins.enable("other-fetcher", other.clone());

    let answered = run_plugin_action(&state, space, &path, "cover-fetcher")
        .await
        .unwrap();

    // Two calls in one errand: the plugin whose menu item was picked is asked to
    // do it, and then the fields are gathered — so the panel that opened the
    // menu draws the video the action left behind, without a second command and
    // without the interface knowing that this action, alone among them, is
    // followed by a refresh.
    let asked: Vec<String> = chosen
        .asked()
        .into_iter()
        .map(|(method, _)| method)
        .collect();
    assert_eq!(
        asked,
        vec![
            mount_points::VIDEO_ACTIONS.to_string(),
            mount_points::VIDEO_FIELDS.to_string(),
        ]
    );
    let told_about_the_click = other
        .asked()
        .iter()
        .filter(|(method, _)| method == mount_points::VIDEO_ACTIONS)
        .count();
    assert_eq!(
        told_about_the_click, 0,
        "and the plugin whose item was not picked is not told about the click — \
         the refresh asks every plugin for its fields, which is a different \
         question and the one the chain is"
    );
    landed(&answered, &state);
    assert_eq!(triples(&stored(&state, space, &path))[0].2, "cover-fetcher");
}

#[tokio::test]
async fn an_action_for_a_path_this_library_does_not_hold_is_never_run() {
    let (_fixture, state, space, _path) = state_with_one_record();
    let body = offering(&[("cover", "/covers/1.jpg")]);
    state.plugins.enable("cover-fetcher", body.clone());

    let error = run_plugin_action(&state, space, "/library/nowhere.mp4", "cover-fetcher")
        .await
        .unwrap_err();

    // The same refusal the refresh makes, and made before the plugin is asked
    // for the same reason: an action is about one record, and a plugin told to
    // act on a file the library does not hold has been told about a record that
    // does not exist.
    assert_eq!(error.code, "media.file.not_found");
    assert_eq!(body.asked_times(), 0);
}

#[tokio::test]
async fn the_index_is_not_held_while_the_plugins_are_asked() {
    let (_fixture, state, space, path) = state_with_one_record();
    // Two gates rather than a sleep: one to tell the test the call is inside the
    // plugin, and one to hold it there until the test has looked. A body that
    // merely took its time would make the assertion below a race.
    let entered = Arc::new(Barrier::new(2));
    let released = Arc::new(Barrier::new(2));
    let body = FakeBody::doing({
        let (entered, released) = (entered.clone(), released.clone());
        move |_, _| {
            entered.wait();
            released.wait();
            Ok(fixture::fields(&[("cover", "/covers/1.jpg")]))
        }
    });
    state.plugins.enable("slow-fetcher", body);

    std::thread::scope(|scope| {
        let asking = scope.spawn(|| {
            // The refresh is asynchronous because the cover it may have to go
            // and fetch is a wait on somebody else's server. A thread of its own
            // with a runtime of its own is what makes this test about the lock
            // rather than about which executor happened to be running.
            tokio::runtime::Builder::new_current_thread()
                .build()
                .unwrap()
                .block_on(refresh_fields(&state, space, &path))
        });
        entered.wait();
        // The call is in the plugin's hands right now, and the index is free:
        // the record is looked up and then let go of, and the lock is taken
        // again only to write. A plugin is asked inside a command, and a plugin
        // that takes its time must not stop a scan from reading the library.
        assert!(state.repository.try_lock().is_ok());
        released.wait();
        asking.join().unwrap().unwrap();
    });
}
