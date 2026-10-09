//! The virtual filesystem's own contract, driven through the interface the
//! WebDAV library defines: which names a listing comes back with, and whether
//! opening a file and reading its metadata recognise them.
//!
//! This is where the naming rules are exhaustive, because they have more
//! branches than they look to: two files wanting one name, two names differing
//! only by their extension, a file already called `（1）`, and the question of
//! which of two files keeps the plain name. Each of those through a socket would
//! mean starting a service of its own, and a naming mistake would reach the
//! reader as "the television cannot open it".
//!
//! The files are real files in a temporary directory. Nothing here stands in for
//! the file system, for the same reason the library's tests run against a real
//! database rather than a fake one.

use std::io::SeekFrom;
use std::path::Path;

use dav_server::davpath::DavPath;
use dav_server::fs::{DavFileSystem, FsError, OpenOptions, ReadDirMeta};
use futures_util::StreamExt;

use super::fixture::{encoded, listing};
use super::fs::ShareFs;

/// A path as a request would carry it.
fn at(path: &str) -> DavPath {
    DavPath::new(&encoded(path)).unwrap()
}

/// Every name the root lists, in the order the listing gives them.
async fn listed(files: &ShareFs) -> Vec<String> {
    files
        .read_dir(&at("/"), ReadDirMeta::Data)
        .await
        .unwrap()
        .map(|entry| String::from_utf8(entry.unwrap().name()).unwrap())
        .collect()
        .await
}

/// What a name stands for, read out of the file it opens.
async fn reads_as(files: &ShareFs, name: &str) -> String {
    let options = OpenOptions {
        read: true,
        ..Default::default()
    };
    let mut file = files.open(&at(name), options).await.unwrap();
    let bytes = file.read_bytes(4096).await.unwrap();
    String::from_utf8(bytes.to_vec()).unwrap()
}

#[tokio::test]
async fn the_root_lists_every_video_flat_under_the_name_it_has_on_disk() {
    let (_fixture, paths) = listing(&["Movies/开场.mp4", "Archive/花絮.mkv"]);
    let files = ShareFs::build(&paths);
    // In name order, which is the order a listing comes back in.
    assert_eq!(listed(&files).await, vec!["开场.mp4", "花絮.mkv"]);
    // The directories the videos were spread over are not part of the answer:
    // they are not collections here, and not empty ones either — they are not
    // anything.
    assert_eq!(
        files.metadata(&at("/Movies")).await.err(),
        Some(FsError::NotFound)
    );
    // The root is a collection, and the files are not.
    assert!(files.metadata(&at("/")).await.unwrap().is_dir());
    assert!(!files.metadata(&at("/开场.mp4")).await.unwrap().is_dir());
}

#[tokio::test]
async fn two_files_wanting_one_name_are_told_apart_before_the_extension() {
    let (_fixture, paths) = listing(&["a/开场.mp4", "b/开场.mp4"]);
    let files = ShareFs::build(&paths);
    assert_eq!(listed(&files).await, vec!["开场.mp4", "开场（1）.mp4"]);
    // The first file on the list keeps the plain name, and the second is the one
    // that moved — so the name a viewer has been watching under keeps working.
    assert_eq!(reads_as(&files, "/开场.mp4").await, "a/开场.mp4");
    assert_eq!(reads_as(&files, "/开场（1）.mp4").await, "b/开场.mp4");
}

#[tokio::test]
async fn names_differing_only_by_their_extension_do_not_collide() {
    let (_fixture, paths) = listing(&["a/片段.mp4", "b/片段.mkv"]);
    let files = ShareFs::build(&paths);
    // Neither is numbered: they are two different names, and a number would only
    // make the viewer read them as two versions of one thing.
    assert_eq!(listed(&files).await, vec!["片段.mkv", "片段.mp4"]);
}

#[tokio::test]
async fn a_name_that_already_looks_numbered_takes_part_in_the_numbering() {
    let (_fixture, paths) = listing(&["a/开场.mp4", "b/开场（1）.mp4", "c/开场.mp4"]);
    let files = ShareFs::build(&paths);
    // The second file is called `开场（1）` on disk and keeps it — a name that
    // happens to look generated is still the name the user gave the file. The
    // third therefore has to go past it rather than collide with it.
    assert_eq!(
        listed(&files).await,
        vec!["开场.mp4", "开场（1）.mp4", "开场（2）.mp4"]
    );
    assert_eq!(reads_as(&files, "/开场（1）.mp4").await, "b/开场（1）.mp4");
    assert_eq!(reads_as(&files, "/开场（2）.mp4").await, "c/开场.mp4");
}

#[tokio::test]
async fn the_numbers_follow_the_list_order_and_not_the_names() {
    let (_fixture, paths) = listing(&["a/开场.mp4", "b/开场.mp4"]);
    // The same two files, offered the other way round: whichever comes first on
    // the list keeps the plain name, which is what makes the numbering a
    // property of the list rather than of the file names.
    let mut reversed = paths.clone();
    reversed.reverse();
    let first = ShareFs::build(&paths);
    let second = ShareFs::build(&reversed);
    assert_eq!(reads_as(&first, "/开场.mp4").await, "a/开场.mp4");
    assert_eq!(reads_as(&second, "/开场.mp4").await, "b/开场.mp4");
}

#[tokio::test]
async fn one_list_builds_the_same_names_every_time() {
    let (_fixture, paths) = listing(&["a/开场.mp4", "b/开场.mp4", "c/花絮.mkv"]);
    let once = ShareFs::build(&paths);
    let twice = ShareFs::build(&paths);
    assert_eq!(listed(&once).await, listed(&twice).await);
    // Not just the same set of names but the same mapping: a viewer that keeps
    // its place by file name has to find the same film under it after a restart.
    for name in listed(&once).await {
        assert_eq!(
            reads_as(&once, &format!("/{name}")).await,
            reads_as(&twice, &format!("/{name}")).await
        );
    }
}

#[tokio::test]
async fn a_video_whose_file_is_gone_is_left_out_and_counted() {
    let (fixture, mut paths) = listing(&["a/开场.mp4"]);
    let gone = fixture.0.join("Archive").join("花絮.mkv");
    paths.push(gone.to_string_lossy().into_owned());
    let files = ShareFs::build(&paths);
    // It is not listed under a name nothing can be opened by, and the count is
    // what the interface has to show: the television will have one fewer video
    // than the user picked.
    assert_eq!(listed(&files).await, vec!["开场.mp4"]);
    assert_eq!(files.missing(), 1);
}

#[tokio::test]
async fn nothing_outside_the_list_is_found_however_it_is_spelled() {
    let (fixture, paths) = listing(&["a/开场.mp4"]);
    let files = ShareFs::build(&paths);
    let outside = fixture.0.join("outside.mp4");
    std::fs::write(&outside, b"not on the list").unwrap();
    // One shape never reaches the filesystem at all: the path parser refuses a
    // `..` that would climb out of the root before anything here is asked, which
    // is the outer half of the same guarantee.
    assert!(DavPath::new("/../outside.mp4").is_err());
    for path in [
        // A file that exists on disk but was never picked.
        "/outside.mp4",
        // The real path the video has on disk, which is not the one it is
        // served under.
        "/a/开场.mp4",
        // An escaping shape the parser normalises rather than refuses, and one
        // that survives it as written. Neither names anything in the map.
        "/a/../outside.mp4",
        "//outside.mp4",
    ] {
        assert_eq!(
            files.metadata(&at(path)).await.err(),
            Some(FsError::NotFound),
            "{path}"
        );
    }
    // And the root cannot be opened as a file, only listed.
    let options = OpenOptions {
        read: true,
        ..Default::default()
    };
    assert!(files.open(&at("/"), options).await.is_err());
}

#[tokio::test]
async fn opening_for_anything_but_reading_is_refused() {
    let (_fixture, paths) = listing(&["a/开场.mp4"]);
    let files = ShareFs::build(&paths);
    for options in [
        OpenOptions {
            write: true,
            ..Default::default()
        },
        OpenOptions {
            read: true,
            write: true,
            ..Default::default()
        },
        OpenOptions {
            create: true,
            ..Default::default()
        },
        OpenOptions {
            append: true,
            ..Default::default()
        },
    ] {
        assert_eq!(
            files.open(&at("/开场.mp4"), options).await.err(),
            Some(FsError::Forbidden)
        );
    }
}

#[tokio::test]
async fn a_file_reads_back_the_bytes_it_holds_from_wherever_it_is_asked_to() {
    let (_fixture, paths) = listing(&["a/开场.mp4"]);
    let files = ShareFs::build(&paths);
    let options = OpenOptions {
        read: true,
        ..Default::default()
    };
    let content = std::fs::read(&paths[0]).unwrap();
    let mut file = files.open(&at("/开场.mp4"), options).await.unwrap();
    assert_eq!(&file.read_bytes(3).await.unwrap()[..], &content[..3]);
    // A range request is a seek and a read, so both have to land where the
    // client said: this is what a player dragging its position bar does.
    assert_eq!(file.seek(SeekFrom::Start(2)).await.unwrap(), 2);
    assert_eq!(&file.read_bytes(2).await.unwrap()[..], &content[2..4]);
    // Reading to the end is short, and reading past it is empty: neither is a
    // failure, they are how the client is told there is no more.
    let rest = file.read_bytes(4096).await.unwrap();
    assert_eq!(rest.len(), content.len() - 4);
    assert!(file.read_bytes(64).await.unwrap().is_empty());
    // And metadata is what the listing said it was.
    let metadata = std::fs::metadata(Path::new(&paths[0])).unwrap();
    assert_eq!(
        files.metadata(&at("/开场.mp4")).await.unwrap().len(),
        metadata.len()
    );
}
