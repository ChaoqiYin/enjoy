//! What the interface's listing asks of the library: one page of records, the
//! count they were taken out of, and the filters and order the page answers to.

use std::fs;
use std::thread;
use std::time::Duration;

use crate::model::{SortDirection, VideoFilter, VideoQuery, VideoSort};
use crate::repository::fixture::{Fixture, Library};
use crate::scan::scanner;

/// How many records a test's page holds unless the test is about the count.
const PAGE: i64 = 24;

/// A query naming no filter and no sort: what the interface sends for a page
/// whose user has touched nothing, apart from which page it is.
fn query(space_id: i64) -> VideoQuery {
    VideoQuery {
        space_id,
        search: None,
        folder: None,
        only: None,
        sort: None,
        direction: None,
        offset: 0,
        limit: PAGE,
    }
}

/// A library holding the named files, each of the given size, all scanned at
/// once — so they are all as old as each other, which is what 最近添加 needs a
/// test to be able to say something about ([`add_file_after`]).
fn library_with(files: &[(&str, usize)]) -> (Fixture, Library) {
    let fixture = Fixture::new();
    for (name, size) in files {
        fs::write(fixture.0.join(name), vec![b'x'; *size]).unwrap();
    }
    let mut library = fixture.library();
    index(&mut library, &fixture);
    (fixture, library)
}

/// Scans the directory as it stands now, as a rescan of it would.
fn index(library: &mut Library, fixture: &Fixture) {
    let root = fixture.0.to_string_lossy().into_owned();
    library
        .repository
        .index(library.space, &root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
}

/// Adds a file a moment after everything already there, so that the record it
/// becomes is newer than the rest and 最近添加 has something to order by.
///
/// The wait is what makes that a fact: `created_at` is milliseconds, and a
/// second scan can otherwise land on the same one as the first. A record keeps
/// the stamp it was first written with, so the files already there keep theirs.
fn add_file_after(fixture: &Fixture, library: &mut Library, name: &str, size: usize) {
    thread::sleep(Duration::from_millis(5));
    fs::write(fixture.0.join(name), vec![b'x'; size]).unwrap();
    index(library, fixture);
}

fn names(page: &crate::model::VideoPage) -> Vec<String> {
    page.items.iter().map(|row| row.file_name.clone()).collect()
}

#[test]
fn a_page_carries_its_records_and_the_total_the_space_holds() {
    let (fixture, mut library) = library_with(&[("first.mp4", 1)]);
    add_file_after(&fixture, &mut library, "second.mp4", 1);
    add_file_after(&fixture, &mut library, "third.mp4", 1);

    let page = library
        .repository
        .list(&VideoQuery {
            limit: 2,
            ..query(library.space)
        })
        .unwrap();
    // The page is the page and the count is the library: the interface needs
    // both at once, because it draws how far the user has got and how much
    // there is in one line.
    assert_eq!(names(&page), ["third.mp4", "second.mp4"]);
    assert_eq!(page.total, 3);
}

#[test]
fn a_search_matches_the_file_name_and_not_the_directory_it_sits_in() {
    let fixture = Fixture::new();
    fs::create_dir(fixture.0.join("holiday")).unwrap();
    fs::write(fixture.0.join("holiday").join("clip.mp4"), b"x").unwrap();
    fs::write(fixture.0.join("holiday-2019.mp4"), b"x").unwrap();
    let mut library = fixture.library();
    index(&mut library, &fixture);

    let page = library
        .repository
        .list(&VideoQuery {
            search: Some("holiday".into()),
            ..query(library.space)
        })
        .unwrap();
    // The one under `holiday/` is not a match: the user is typing the name they
    // read on the card, and a directory it happens to live in is not that.
    assert_eq!(names(&page), ["holiday-2019.mp4"]);
    // The count is the whole answer, not the page: one match, one record on it.
    assert_eq!(page.total, 1);
}

#[test]
fn what_the_user_types_is_looked_for_as_it_stands() {
    let (_fixture, library) = library_with(&[
        ("50% off.mp4", 1),
        ("50 percent off.mp4", 1),
        ("a_b.mp4", 1),
        ("axb.mp4", 1),
    ]);
    let found = |search: &str| {
        let page = library
            .repository
            .list(&VideoQuery {
                search: Some(search.into()),
                ..query(library.space)
            })
            .unwrap();
        names(&page)
    };
    // `%` and `_` mean something to the query language and nothing to the user,
    // who is looking for the name they typed. A search that read them as its own
    // would answer with records that do not hold what was asked for.
    assert_eq!(found("50%"), ["50% off.mp4"]);
    assert_eq!(found("a_b"), ["a_b.mp4"]);
}

#[test]
fn a_directory_filter_names_one_directory_and_not_its_neighbours() {
    let fixture = Fixture::new();
    fs::create_dir_all(fixture.0.join("holiday")).unwrap();
    fs::create_dir_all(fixture.0.join("holiday-2019")).unwrap();
    fs::write(fixture.0.join("holiday").join("one.mp4"), b"x").unwrap();
    fs::write(fixture.0.join("holiday-2019").join("two.mp4"), b"x").unwrap();
    fs::write(fixture.0.join("three.mp4"), b"x").unwrap();
    let mut library = fixture.library();
    index(&mut library, &fixture);

    let page = library
        .repository
        .list(&VideoQuery {
            folder: Some(fixture.0.join("holiday").to_string_lossy().into_owned()),
            ..query(library.space)
        })
        .unwrap();
    // A directory beside the one asked for is a different directory, and the
    // root is not a directory any record was filed under in this fixture.
    assert_eq!(names(&page), ["one.mp4"]);
    assert_eq!(page.total, 1);
}

#[test]
fn a_page_of_the_library_carries_the_condition_it_is_a_page_of() {
    let (_fixture, library) = library_with(&[("a.mp4", 1), ("b.mp4", 1), ("c.mp4", 1)]);
    let path_of = |suffix: &str| {
        library
            .repository
            .records(library.space)
            .unwrap()
            .into_iter()
            .find(|video| video.file_name == suffix)
            .unwrap()
            .path
    };
    let (a, b, c) = (path_of("a.mp4"), path_of("b.mp4"), path_of("c.mp4"));
    library
        .repository
        .favorite(library.space, &a, true)
        .unwrap();
    library.repository.share(library.space, &b, true).unwrap();
    library.repository.record_play(library.space, &c).unwrap();

    let marked = |only: VideoFilter| {
        let page = library
            .repository
            .list(&VideoQuery {
                only: Some(only),
                ..query(library.space)
            })
            .unwrap();
        names(&page)
    };
    // Which records a page holds is the backend's answer now: the interface has
    // one page in hand, and "the favorites" is not something a page can work out
    // from itself (ADR 0016).
    assert_eq!(marked(VideoFilter::Favorite), ["a.mp4"]);
    assert_eq!(marked(VideoFilter::Shared), ["b.mp4"]);
    // Play history is the record having been played; the two marks beside it are
    // not history, and a record with neither is not on this page.
    assert_eq!(marked(VideoFilter::Played), ["c.mp4"]);
}

#[test]
fn a_page_is_ordered_by_the_order_that_was_asked_for() {
    let fixture = Fixture::new();
    // Added in this order, so 最近添加 has three different stamps to read; the
    // sizes are not in that order, nor in the order of the names.
    fs::write(fixture.0.join("alpha.mp4"), vec![b'x'; 30]).unwrap();
    let mut library = fixture.library();
    index(&mut library, &fixture);
    add_file_after(&fixture, &mut library, "bravo.mp4", 10);
    add_file_after(&fixture, &mut library, "charlie.mp4", 20);
    let path_of = |name: &str| {
        library
            .repository
            .records(library.space)
            .unwrap()
            .into_iter()
            .find(|video| video.file_name == name)
            .unwrap()
            .path
    };
    // Played in an order of its own, and bravo never played at all: the three
    // orders have nothing in common, so one of them passing cannot carry another.
    library
        .repository
        .record_play(library.space, &path_of("alpha.mp4"))
        .unwrap();
    thread::sleep(Duration::from_millis(5));
    library
        .repository
        .record_play(library.space, &path_of("charlie.mp4"))
        .unwrap();

    let ordered = |sort: VideoSort, direction: Option<SortDirection>| {
        let page = library
            .repository
            .list(&VideoQuery {
                sort: Some(sort),
                direction,
                ..query(library.space)
            })
            .unwrap();
        names(&page)
    };
    // A direction the query does not name is the one the page is read in: newest
    // first, most recently played first, largest first, and a name from A.
    assert_eq!(
        ordered(VideoSort::Added, None),
        ["charlie.mp4", "bravo.mp4", "alpha.mp4"]
    );
    assert_eq!(
        ordered(VideoSort::Added, Some(SortDirection::Asc)),
        ["alpha.mp4", "bravo.mp4", "charlie.mp4"]
    );
    assert_eq!(
        ordered(VideoSort::Name, None),
        ["alpha.mp4", "bravo.mp4", "charlie.mp4"]
    );
    assert_eq!(
        ordered(VideoSort::Name, Some(SortDirection::Desc)),
        ["charlie.mp4", "bravo.mp4", "alpha.mp4"]
    );
    // 最近打开 and 打开时间 are the two directions of the one field, so the sort
    // is named once and the direction says which: bravo, never played, has no
    // time to be placed by and comes last among the played.
    assert_eq!(
        ordered(VideoSort::Played, None),
        ["charlie.mp4", "alpha.mp4", "bravo.mp4"]
    );
    assert_eq!(
        ordered(VideoSort::Played, Some(SortDirection::Asc)),
        ["bravo.mp4", "alpha.mp4", "charlie.mp4"]
    );
    assert_eq!(
        ordered(VideoSort::Size, None),
        ["alpha.mp4", "charlie.mp4", "bravo.mp4"]
    );
    assert_eq!(
        ordered(VideoSort::Size, Some(SortDirection::Asc)),
        ["bravo.mp4", "charlie.mp4", "alpha.mp4"]
    );
}

#[test]
fn a_page_that_is_not_there_is_still_an_answer_about_the_library() {
    let (_fixture, library) = library_with(&[("a.mp4", 1), ("b.mp4", 1)]);
    let page = |offset: i64, limit: i64| {
        library
            .repository
            .list(&VideoQuery {
                offset,
                limit,
                ..query(library.space)
            })
            .unwrap()
    };

    // Past the end — what a page index left behind by a shrinking library asks
    // for — is an empty page, and the count is still the library's. It is the
    // count that tells the interface to go back to a page that exists.
    let beyond = page(2, 24);
    assert!(beyond.items.is_empty());
    assert_eq!(beyond.total, 2);

    // An empty page asked for deliberately is empty, not everything: a limit is
    // how many records the page holds, and the whole library is not a number any
    // caller meant to send as zero.
    let empty = page(0, 0);
    assert!(empty.items.is_empty());
    assert_eq!(empty.total, 2);

    // What was asked for out of range is read as what it was nearest to: a
    // negative offset is the first page, and a negative limit is an empty one.
    assert_eq!(names(&page(-3, 2)), ["b.mp4", "a.mp4"]);
    assert!(page(0, -1).items.is_empty());
}

#[test]
fn a_filter_that_matches_nothing_is_an_empty_page_of_a_library_that_is_still_there() {
    let (_fixture, library) = library_with(&[("a.mp4", 1), ("b.mp4", 1)]);
    let page = library
        .repository
        .list(&VideoQuery {
            search: Some("nothing is called this".into()),
            ..query(library.space)
        })
        .unwrap();
    // The page is empty and the library is not: the interface draws the empty
    // state for the one, and the count behind it is what says the other.
    assert!(page.items.is_empty());
    assert_eq!(page.total, 0);
}

#[test]
fn the_pages_of_a_library_add_up_to_the_count_each_of_them_reports() {
    let (_fixture, library) = library_with(&[("a.mp4", 1), ("b.mp4", 1), ("c.mp4", 1)]);
    let page = |offset: i64| {
        library
            .repository
            .list(&VideoQuery {
                offset,
                limit: 2,
                ..query(library.space)
            })
            .unwrap()
    };
    // What the interface counts pages with: every page of one query reports the
    // same total, and the records they carry are all of them exactly once.
    let mut walked = Vec::new();
    for offset in (0..6).step_by(2) {
        let page = page(offset);
        assert_eq!(page.total, 3);
        walked.extend(names(&page));
    }
    assert_eq!(walked, ["c.mp4", "b.mp4", "a.mp4"]);
}
