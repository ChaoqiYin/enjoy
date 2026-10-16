//! What the kernel does with the cover a plugin answered with.
//!
//! The plugin's half — reaching the site and working out which image it wants —
//! is the plugin's, and nothing here asks about it. What is asked is the half
//! that cannot be the plugin's: an address becomes a file in `covers/`, and a
//! value that is already a path is left exactly as it was.

use std::fs;
use std::path::{Path, PathBuf};

use super::cover::settle;
use super::fixture::serving;
use crate::model::VideoField;
use crate::repository::fixture::Fixture;

/// The fields a plugin answered with, as the chain hands them to the kernel.
fn fields(pairs: &[(&str, &str)]) -> Vec<VideoField> {
    pairs
        .iter()
        .map(|(key, value)| VideoField {
            key: key.to_string(),
            value: value.to_string(),
            source_plugin: "cover-fetcher".to_string(),
        })
        .collect()
}

fn keys(fields: &[VideoField]) -> Vec<&str> {
    fields.iter().map(|field| field.key.as_str()).collect()
}

/// A covers directory inside a fixture, so that it goes when the test does.
fn covers(fixture: &Fixture) -> PathBuf {
    fixture.0.join("covers")
}

/// The file name the settled value names, which is the whole of where a cover
/// lands.
fn landed(fields: &[VideoField]) -> String {
    Path::new(&fields[0].value)
        .file_name()
        .expect("a file name")
        .to_string_lossy()
        .into_owned()
}

#[tokio::test]
async fn an_address_a_plugin_answered_with_becomes_a_file_the_window_can_draw() {
    let fixture = Fixture::new();
    let directory = covers(&fixture);
    let address = serving("200 OK", "Content-Type: image/jpeg\r\n", b"a picture");
    let mut answered = fields(&[("cover", &address)]);

    settle(&directory, 7, &mut answered).await;

    let path = PathBuf::from(&answered[0].value);
    assert!(
        path.starts_with(&directory),
        "the value is a path inside the covers directory, which is the one place \
         the asset protocol reaches and a plugin cannot write: {}",
        path.display()
    );
    assert_eq!(
        landed(&answered),
        "7.jpg",
        "named after the video it is for, so that a second cover replaces this one"
    );
    assert_eq!(fs::read(&path).unwrap(), b"a picture");
    assert_eq!(
        answered[0].source_plugin, "cover-fetcher",
        "and the plugin that found it is still the one the library will credit"
    );
}

#[tokio::test]
async fn what_the_image_is_written_as_comes_from_its_address_first() {
    let fixture = Fixture::new();
    let directory = covers(&fixture);
    // The server says png and the address says jpeg, which is what a CDN that
    // rewrites a name on the way past looks like. The address is what the plugin
    // asked for and what the site named, so the address is what is believed.
    let address = format!(
        "{}/photo.jpeg?w=200",
        serving("200 OK", "Content-Type: image/png\r\n", b"a picture")
    );
    let mut answered = fields(&[("cover", &address)]);

    settle(&directory, 7, &mut answered).await;

    assert_eq!(landed(&answered), "7.jpg", "jpeg and jpg are one thing");
}

#[tokio::test]
async fn and_from_what_the_server_says_when_the_address_does_not_say() {
    let fixture = Fixture::new();
    let directory = covers(&fixture);
    // An address with no file at the end of it, which is what a route or a
    // hashed object name looks like: nothing there says what the bytes are.
    let address = format!(
        "{}/photo?id=3",
        serving(
            "200 OK",
            "Content-Type: image/webp; charset=binary\r\n",
            b"a picture"
        )
    );
    let mut answered = fields(&[("cover", &address)]);

    settle(&directory, 7, &mut answered).await;

    assert_eq!(
        landed(&answered),
        "7.webp",
        "the content type, without whatever else it carries"
    );
}

#[tokio::test]
async fn a_value_that_is_already_a_path_is_what_the_library_keeps() {
    let fixture = Fixture::new();
    let directory = covers(&fixture);
    let mut answered = fields(&[("cover", "/covers/1.jpg")]);

    settle(&directory, 7, &mut answered).await;

    // A plugin is allowed to answer with a path, and the kernel has no business
    // asking how it worked one out. What it must not do is treat every value as
    // an address: a path is not a thing to fetch.
    assert_eq!(answered[0].value, "/covers/1.jpg");
    assert!(!directory.exists(), "and nothing was written");
}

#[tokio::test]
async fn a_picture_that_did_not_arrive_leaves_the_record_with_the_one_it_had() {
    let fixture = Fixture::new();
    let directory = covers(&fixture);
    let address = serving("404 Not Found", "", b"");
    let mut answered = fields(&[("cover", &address), ("rating", "5")]);

    settle(&directory, 7, &mut answered).await;

    // Left out of the batch rather than replaced by the address: `save_fields`
    // adds and never deletes, so a field that is not in the batch is a field
    // whose stored value stands. Storing the address instead would draw a broken
    // picture where the user had a good one.
    assert_eq!(keys(&answered), ["rating"]);
    assert!(!directory.exists(), "and nothing was written");
}

#[tokio::test]
async fn a_picture_nothing_says_the_kind_of_is_not_stored() {
    let fixture = Fixture::new();
    let directory = covers(&fixture);
    let address = format!("{}/photo?id=3", serving("200 OK", "", b"a picture"));
    let mut answered = fields(&[("cover", &address), ("rating", "5")]);

    settle(&directory, 7, &mut answered).await;

    // The asset protocol serves a file under the media type its extension says,
    // and a picture the browser refuses is not a cover. Guessing would write a
    // file nothing can draw, so nothing is written.
    assert_eq!(keys(&answered), ["rating"]);
    assert!(!directory.exists());
}

#[tokio::test]
async fn a_record_with_no_cover_is_not_touched() {
    let fixture = Fixture::new();
    let directory = covers(&fixture);
    let mut answered = fields(&[("rating", "5"), ("watched", "yes")]);

    settle(&directory, 7, &mut answered).await;

    assert_eq!(keys(&answered), ["rating", "watched"]);
    assert!(!directory.exists());
}

#[tokio::test]
async fn a_second_cover_for_the_same_video_does_not_leave_the_first_one_behind() {
    let fixture = Fixture::new();
    let directory = covers(&fixture);
    let first = format!(
        "{}/one.png",
        serving("200 OK", "Content-Type: image/png\r\n", b"the first")
    );
    let second = format!(
        "{}/two.webp",
        serving("200 OK", "Content-Type: image/webp\r\n", b"the second")
    );

    let mut answered = fields(&[("cover", &first)]);
    settle(&directory, 7, &mut answered).await;
    let mut again = fields(&[("cover", &second)]);
    settle(&directory, 7, &mut again).await;

    // One video has one picture. The record now names the second one, and a file
    // nothing names any more is a file that would stay in the directory for
    // good — the id is the whole of a cover's name, so the first one is exactly
    // what can be recognised as this video's and not another's.
    assert_eq!(landed(&again), "7.webp");
    assert_eq!(fs::read(Path::new(&again[0].value)).unwrap(), b"the second");
    let left: Vec<String> = fs::read_dir(&directory)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(left, ["7.webp"], "and it is the only cover of this video");
}
