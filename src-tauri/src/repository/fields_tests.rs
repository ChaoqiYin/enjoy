//! What the plugins have written about a record: the row a field is, the pair
//! that makes it one row, and the rule that a write adds and replaces but never
//! takes away.

use std::fs;

use crate::model::VideoField;
use crate::repository::fixture::{Fixture, Library};
use crate::scan::scanner;

/// A field, spelled the short way a test wants it.
fn field(key: &str, value: &str, source: &str) -> VideoField {
    VideoField {
        key: key.into(),
        value: value.into(),
        source_plugin: source.into(),
    }
}

/// What a read answered, as the triple each row is: the key it is filed under,
/// the value, and the plugin that wrote it.
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

/// A library holding one record, and the id that record is known by — the two
/// things every test here needs before it can ask about a field.
fn library_with_one_record() -> (Fixture, Library, i64) {
    let fixture = Fixture::new();
    let movie = fixture.0.join("clip.mp4");
    fs::write(&movie, b"content").unwrap();
    let mut library = fixture.library();
    let root = fixture.0.to_string_lossy().into_owned();
    library
        .repository
        .index(library.space, &root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    let path = movie.to_string_lossy().into_owned();
    let id = library.repository.video_id(library.space, &path).unwrap();
    (fixture, library, id)
}

#[test]
fn a_field_written_twice_is_one_row_whose_value_and_source_moved() {
    let (_fixture, mut library, id) = library_with_one_record();
    library
        .repository
        .save_fields(id, &[field("cover", "/covers/1.jpg", "cover-fetcher")])
        .unwrap();
    library
        .repository
        .save_fields(id, &[field("cover", "/covers/2.jpg", "other-fetcher")])
        .unwrap();

    // One row, and it is the second write: the pair is the key of the row, so a
    // second plugin answering the same field replaces the value and the source
    // together. Two rows would leave the interface with two covers and nothing
    // in the table saying which one won.
    assert_eq!(
        triples(&library.repository.fields(id).unwrap()),
        [("cover", "/covers/2.jpg", "other-fetcher")]
    );
}

#[test]
fn fields_are_read_back_in_key_order() {
    let (_fixture, mut library, id) = library_with_one_record();
    library
        .repository
        .save_fields(
            id,
            &[
                field("year", "1999", "metadata-fetcher"),
                field("cover", "/covers/1.jpg", "cover-fetcher"),
                field("rating", "8.1", "metadata-fetcher"),
            ],
        )
        .unwrap();

    // The order is the read's own rather than the write's: the interface draws
    // these in the order it is given them, and a row order that followed
    // whichever plugin happened to answer first would move the rows around
    // under a user who changed nothing.
    let keys: Vec<String> = library
        .repository
        .fields(id)
        .unwrap()
        .into_iter()
        .map(|field| field.key)
        .collect();
    assert_eq!(keys, ["cover", "rating", "year"]);
}

#[test]
fn a_write_that_answered_nothing_leaves_the_stored_fields_alone() {
    let (_fixture, mut library, id) = library_with_one_record();
    library
        .repository
        .save_fields(
            id,
            &[
                field("cover", "/covers/1.jpg", "cover-fetcher"),
                field("year", "1999", "metadata-fetcher"),
            ],
        )
        .unwrap();

    // A plugin that is disabled, uninstalled, or simply has nothing to say this
    // time answers with nothing — and nothing is not an instruction to delete.
    // What a plugin added stays where it is until someone asks for it to go
    // (User Story 7), so a write clears nothing on its way in.
    library.repository.save_fields(id, &[]).unwrap();
    assert_eq!(
        triples(&library.repository.fields(id).unwrap()),
        [
            ("cover", "/covers/1.jpg", "cover-fetcher"),
            ("year", "1999", "metadata-fetcher")
        ]
    );
}

#[test]
fn a_path_the_space_holds_no_record_for_has_no_id() {
    let (_fixture, library, _id) = library_with_one_record();
    let error = library
        .repository
        .video_id(library.space, "/movies/nowhere.mp4")
        .unwrap_err();
    // The same verdict every other question about an unknown path gets, because
    // it is the same question. It is what keeps the plugins from being asked
    // about a file this library does not have.
    assert_eq!(error.code, "media.file.not_found");
}
