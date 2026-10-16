//! What a refresh puts in the library, and what it reads back out.
//!
//! The chain's own rules — who answers first, what an empty answer means — are
//! the dispatch's and are tested beside it. What is asked here is the half this
//! command owns: that the answer reaches the table with the plugin that gave it,
//! that the user's order is what decides the winner, and that the source stays
//! readable once the plugin is no longer being asked.

use std::fs;
use std::sync::{Arc, Barrier};

use super::fields::refresh_fields;
use crate::app::{test_state, AppState};
use crate::plugins::fixture::{self, FakeBody};
use crate::repository::fixture::Fixture;
use crate::repository::lock_shared;
use crate::scan::scanner;

/// What a refresh answered, as the triple each field is: the key, the value, and
/// the plugin the value came from.
fn triples(fields: &[crate::model::VideoField]) -> Vec<(&str, &str, &str)> {
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
fn stored(state: &AppState, space: i64, path: &str) -> Vec<crate::model::VideoField> {
    let repository = lock_shared(&state.repository).unwrap();
    let id = repository.video_id(space, path).unwrap();
    repository.fields(id).unwrap()
}

#[test]
fn what_the_chain_answered_is_stored_under_the_plugin_that_gave_it() {
    let (_fixture, state, space, path) = state_with_one_record();
    state.plugins.enable(
        "cover-fetcher",
        FakeBody::answering(fixture::fields(&[("cover", "/covers/1.jpg")])),
    );

    let answered = refresh_fields(&state, space, &path).unwrap();
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

#[test]
fn the_order_the_user_arranged_decides_which_plugin_wins_a_field() {
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
        triples(&refresh_fields(&state, space, &path).unwrap()),
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
        triples(&refresh_fields(&state, space, &path).unwrap()),
        [("cover", "/covers/2.jpg", "other-fetcher")]
    );
    assert_eq!(
        triples(&stored(&state, space, &path)),
        [("cover", "/covers/2.jpg", "other-fetcher")]
    );
}

#[test]
fn a_field_stays_readable_after_the_plugin_that_wrote_it_stops_being_asked() {
    let (_fixture, state, space, path) = state_with_one_record();
    let body = FakeBody::answering(fixture::fields(&[("cover", "/covers/1.jpg")]));
    state.plugins.enable("cover-fetcher", body.clone());
    refresh_fields(&state, space, &path).unwrap();

    // Disabled, which is what an uninstalled plugin looks like from here: the
    // host no longer asks it, and nothing else about it is known. Its id is a
    // bare string in the row rather than a reference to a plugin that exists,
    // which is what lets the source still be readable (ADR 0045 §3, User Story
    // 10) — the value the user chose to keep does not become anonymous.
    state.plugins.disable("cover-fetcher");
    let answered = refresh_fields(&state, space, &path).unwrap();

    assert_eq!(body.asked_times(), 1);
    assert_eq!(
        triples(&answered),
        [("cover", "/covers/1.jpg", "cover-fetcher")]
    );
}

#[test]
fn a_plugin_that_failed_does_not_keep_the_next_one_out() {
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
        triples(&refresh_fields(&state, space, &path).unwrap()),
        [("cover", "/covers/1.jpg", "cover-fetcher")]
    );
}

#[test]
fn a_path_this_library_does_not_hold_is_never_put_to_a_plugin() {
    let (_fixture, state, space, _path) = state_with_one_record();
    let body = FakeBody::answering(fixture::fields(&[("cover", "/covers/1.jpg")]));
    state.plugins.enable("cover-fetcher", body.clone());

    let error = refresh_fields(&state, space, "/library/nowhere.mp4").unwrap_err();

    // Refused before anything was asked: a field belongs to a record, and a
    // plugin asked about a file that is not in the library would be asked about
    // a record that does not exist.
    assert_eq!(error.code, "media.file.not_found");
    assert_eq!(body.asked_times(), 0);
}

#[test]
fn the_index_is_not_held_while_the_plugins_are_asked() {
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
        let asking = scope.spawn(|| refresh_fields(&state, space, &path));
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
