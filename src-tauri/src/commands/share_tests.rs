//! The 共享服务's commands: which list they serve, and when it is read.
//!
//! The rule here is ADR 0012's, at the one layer where the reading happens: the
//! list a command serves is the *named* space's, read at the moment of the call.
//! A command that read it from anywhere else — the space the interface happens
//! to be showing, or the one a running service belongs to — would be offering
//! something the user did not pick, and nothing on either side of the seam could
//! tell: the answer would look exactly like the right one.
//!
//! What is not covered here is the rest of what a command gathers — the language,
//! the password, the machine's addresses — because those need an `AppHandle`.
//! The rules behind them are tested where they live (`i18n::language`,
//! `share::credentials`), and what remains uncovered is the composition: three
//! calls in a row, in one function that only a window can run.

use std::fs;

use super::share::list_of;
use crate::app::{test_state, AppState};
use crate::repository::fixture::Fixture;
use crate::repository::lock_shared;
use crate::scan::scanner;

/// The library a test starts from: two spaces over one directory, each holding
/// two videos, and one video of each on that space's own 共享清单.
struct Seeded {
    /// Kept for as long as the state is used: it owns the directory the records
    /// point at.
    _fixture: Fixture,
    state: AppState,
    first_space: i64,
    second_space: i64,
    first: String,
    second: String,
}

fn seeded() -> Seeded {
    let fixture = Fixture::new();
    // The paths are written the way the scanner writes them — joined onto the
    // directory the scan was given, separators and all — because a record is
    // found by its path: a second spelling of the same file is not the same
    // record, and a test that handed the repository one would be testing that.
    let (movie, archive) = (fixture.0.join("a.mp4"), fixture.0.join("b.mp4"));
    fs::write(&movie, b"a").unwrap();
    fs::write(&archive, b"b").unwrap();
    let root = fixture.0.to_str().unwrap().to_string();
    let first = movie.to_str().unwrap().to_string();
    let second = archive.to_str().unwrap().to_string();
    let state = test_state(&fixture);
    let (first_space, second_space) = {
        let mut repository = lock_shared(&state.repository).unwrap();
        let first_space = repository.current_space().unwrap().id;
        let found = scanner::collect(&fixture.0).unwrap();
        repository.index(first_space, &root, &found).unwrap();
        repository.share(first_space, &first, true).unwrap();
        // The same directory, scanned into a second space: the same files are
        // different records there, which is what spaces are (ADR 0011).
        let second_space = repository.create_space("Another").unwrap().id;
        repository.index(second_space, &root, &found).unwrap();
        repository.share(second_space, &second, true).unwrap();
        (first_space, second_space)
    };
    Seeded {
        _fixture: fixture,
        state,
        first_space,
        second_space,
        first,
        second,
    }
}

#[test]
fn the_list_is_the_named_space_s_own() {
    let seeded = seeded();
    // Each space is answered with its own list, and neither with the other's.
    // Which space the interface is *on* has nothing to do with it: the command
    // is told, and that is what it reads (ADR 0012).
    assert_eq!(
        list_of(&seeded.state, seeded.first_space).unwrap(),
        vec![seeded.first.clone()]
    );
    assert_eq!(
        list_of(&seeded.state, seeded.second_space).unwrap(),
        vec![seeded.second.clone()]
    );
}

#[test]
fn the_list_is_read_every_time_rather_than_remembered() {
    let seeded = seeded();
    let before = list_of(&seeded.state, seeded.first_space).unwrap();
    // The user adds another video to the same space's 共享清单. Nothing is
    // started, nothing is restarted: the next read is what the space holds now,
    // which is what makes a running service's list comparable to it at all.
    lock_shared(&seeded.state.repository)
        .unwrap()
        .share(seeded.first_space, &seeded.second, true)
        .unwrap();
    let after = list_of(&seeded.state, seeded.first_space).unwrap();
    assert_ne!(after, before, "the second read answered the first's list");
    assert!(after.contains(&seeded.second));
}
