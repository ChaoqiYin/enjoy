use std::fs;

use crate::repository::fixture::{Fixture, FIRST_SPACE};
use crate::repository::spaces::NAME_MAX;
use crate::repository::Repository;
use crate::scan::scanner;

/// A database holding one indexed, favorited and played file, plus the path of
/// that file on disk.
fn library_with_one_record() -> (Fixture, Repository, String) {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("movie.mp4"), b"video").unwrap();
    let mut repository = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .replace_videos(
            space,
            &[(
                fixture.0.to_string_lossy().into_owned(),
                scanner::collect(&fixture.0).unwrap(),
            )],
        )
        .unwrap();
    let path = repository.list(space).unwrap()[0].path.clone();
    repository.favorite(space, &path, true).unwrap();
    repository.record_play(space, &path).unwrap();
    (fixture, repository, path)
}

#[test]
fn a_new_space_is_listed_after_the_first_and_becomes_the_one_shown() {
    let fixture = Fixture::new();
    let mut repository = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let first = repository.current_space().unwrap();
    let second = repository.create_space("Second").unwrap();
    assert_ne!(first.id, second.id);
    assert_eq!(repository.current_space().unwrap().id, second.id);
    let names: Vec<String> = repository
        .spaces()
        .unwrap()
        .into_iter()
        .map(|space| space.name)
        .collect();
    assert_eq!(names, vec![FIRST_SPACE.to_owned(), "Second".to_owned()]);
}

#[test]
fn a_name_keeps_the_spelling_it_was_typed_with_and_is_compared_without_case() {
    let fixture = Fixture::new();
    let mut repository = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    // The blank space around a name is not part of the name -- that is the
    // "去掉首尾空白" the rules start from, and storing it would be storing
    // something nobody can see or correct. What is left is kept exactly as
    // written: capitals, accents and spacing inside it are the user's.
    let space = repository.create_space("  Movies  ").unwrap();
    assert_eq!(space.name, "Movies");
    assert_eq!(repository.current_space().unwrap().name, "Movies");
    assert_eq!(
        repository.create_space("movies").unwrap_err().code,
        "space.name.taken"
    );
    // A different space cannot take the name either, and the collision is
    // reported on the name the user typed, not on the stored spelling.
    assert_eq!(
        repository
            .create_space("  MOVIES ")
            .unwrap_err()
            .params
            .get("name")
            .unwrap(),
        "MOVIES"
    );
    // A space keeping its own name is not a collision with itself, so changing
    // only the case of its name is allowed and is what gets stored.
    let renamed = repository.rename_space(space.id, "MOVIES").unwrap();
    assert_eq!(renamed.name, "MOVIES");
    assert_eq!(repository.current_space().unwrap().name, "MOVIES");
}

#[test]
fn creating_and_renaming_hold_a_name_to_the_same_rules() {
    let fixture = Fixture::new();
    let mut repository = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    repository.create_space("Taken").unwrap();
    let other = repository.create_space("Other").unwrap();
    // Both paths answer the same code for the same input, so neither can drift
    // away from the other without this failing.
    for (name, expected) in [
        ("", "space.name.empty"),
        ("   ", "space.name.empty"),
        ("taken", "space.name.taken"),
        ("TAKEN", "space.name.taken"),
    ] {
        assert_eq!(repository.create_space(name).unwrap_err().code, expected);
        assert_eq!(
            repository.rename_space(other.id, name).unwrap_err().code,
            expected
        );
    }
    let longest = "n".repeat(NAME_MAX);
    assert!(repository.create_space(&longest).is_ok());
    let too_long = "n".repeat(NAME_MAX + 1);
    assert_eq!(
        repository.create_space(&too_long).unwrap_err().code,
        "space.name.too_long"
    );
    assert_eq!(
        repository
            .rename_space(other.id, &too_long)
            .unwrap_err()
            .params
            .get("max")
            .unwrap(),
        &NAME_MAX.to_string()
    );
    // None of the refusals changed anything: the name the space had is the name
    // it still has.
    assert_eq!(repository.current_space().unwrap().name, longest);
}

#[test]
fn renaming_a_space_keeps_its_records_and_the_space_shown() {
    let (fixture, mut repository, path) = library_with_one_record();
    let first = repository.current_space().unwrap().id;
    let second = repository.create_space("Second").unwrap();
    assert_eq!(repository.current_space().unwrap().id, second.id);

    // Renaming a space that is not the one shown leaves the shown one alone,
    // and the answer is that one -- what the interface is to adopt.
    let answer = repository.rename_space(first, "Films").unwrap();
    assert_eq!((answer.id, answer.name.as_str()), (second.id, "Second"));
    assert_eq!(repository.current_space().unwrap().id, second.id);

    // A rename is not a move: the records stayed with the space under the same
    // id, favorites and history included.
    assert_eq!(repository.spaces().unwrap()[0].name, "Films");
    let videos = repository.list(first).unwrap();
    assert_eq!(videos.len(), 1);
    assert_eq!(videos[0].path, path);
    assert!(videos[0].favorite);
    assert_eq!(videos[0].play_count, 1);
    assert!(fixture.0.join("movie.mp4").exists());
}

#[test]
fn removing_a_space_clears_its_records_and_leaves_the_files_alone() {
    let (fixture, mut repository, path) = library_with_one_record();
    let first = repository.current_space().unwrap().id;
    let second = repository.create_space("Second").unwrap();
    let scanned = vec![(
        fixture.0.to_string_lossy().into_owned(),
        scanner::collect(&fixture.0).unwrap(),
    )];
    repository.replace_videos(second.id, &scanned).unwrap();
    assert_eq!(repository.list(second.id).unwrap().len(), 1);

    repository.delete_space(second.id).unwrap();
    assert!(repository.list(second.id).unwrap().is_empty());
    assert!(repository.directories(second.id).unwrap().is_empty());

    // The other space holds the same file as a record of its own, untouched,
    // and the file itself was never the index's to remove.
    let kept = repository.list(first).unwrap();
    assert_eq!(kept.len(), 1);
    assert_eq!(kept[0].path, path);
    assert!(kept[0].favorite);
    assert_eq!(kept[0].play_count, 1);
    assert!(fixture.0.join("movie.mp4").exists());
    assert_eq!(repository.directories(first).unwrap().len(), 1);
}

#[test]
fn removing_the_space_shown_moves_the_interface_to_one_that_is_there() {
    let fixture = Fixture::new();
    let mut repository = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let first = repository.current_space().unwrap().id;
    let second = repository.create_space("Second").unwrap();
    let third = repository.create_space("Third").unwrap();

    // The one shown is gone, so the marker moves -- and the answer, which the
    // interface adopts, is a space that really is there.
    let answer = repository.delete_space(third.id).unwrap();
    assert_eq!(answer.id, first);
    assert_eq!(repository.current_space().unwrap().id, answer.id);
    // Removing a space that was not the one shown leaves the marker where it
    // is, rather than handing it on.
    repository.delete_space(second.id).unwrap();
    assert_eq!(repository.current_space().unwrap().id, first);
    assert_eq!(repository.spaces().unwrap().len(), 1);
}

#[test]
fn switching_moves_the_marker_and_leaves_every_space_where_it_was() {
    let fixture = Fixture::new();
    let database = fixture.0.join("library.db");
    let mut repository = Repository::open(&database, FIRST_SPACE).unwrap();
    let first = repository.current_space().unwrap().id;
    let second = repository.create_space("Second").unwrap();
    assert_eq!(repository.current_space().unwrap().id, second.id);

    let answer = repository.switch_space(first).unwrap();
    assert_eq!((answer.id, answer.name.as_str()), (first, FIRST_SPACE));
    assert_eq!(repository.current_space().unwrap().id, first);
    assert_eq!(repository.spaces().unwrap().len(), 2);
    // Switching to the space already being shown is what the user asked for, so
    // it is allowed and changes nothing.
    assert_eq!(repository.switch_space(first).unwrap().id, first);
    assert_eq!(
        repository.switch_space(first + 1000).unwrap_err().code,
        "space.not_found"
    );
    // The marker is the record of where the application was left, so reopening
    // comes back to it -- which is the whole of what "returns to the last space"
    // means; nothing else has to be remembered.
    drop(repository);
    let repository = Repository::open(&database, FIRST_SPACE).unwrap();
    assert_eq!(repository.current_space().unwrap().id, first);
}

#[test]
fn the_last_space_cannot_be_removed() {
    let fixture = Fixture::new();
    let mut repository = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let only = repository.current_space().unwrap().id;
    assert_eq!(
        repository.delete_space(only).unwrap_err().code,
        "space.remove_last"
    );
    assert_eq!(repository.spaces().unwrap().len(), 1);
    // Two may become one; the refusal begins at the last one, whichever space
    // that turns out to be.
    let second = repository.create_space("Second").unwrap();
    repository.delete_space(second.id).unwrap();
    let last = repository.current_space().unwrap().id;
    assert_eq!(
        repository.delete_space(last).unwrap_err().code,
        "space.remove_last"
    );
    assert_eq!(repository.spaces().unwrap().len(), 1);
}

#[test]
fn a_space_that_is_not_there_cannot_be_renamed_or_removed() {
    let fixture = Fixture::new();
    let mut repository = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let missing = repository.current_space().unwrap().id + 1000;
    assert_eq!(
        repository.rename_space(missing, "Any").unwrap_err().code,
        "space.not_found"
    );
    // A space that does not exist is reported as missing even when the name it
    // was given is itself unacceptable: there is nothing to rename.
    assert_eq!(
        repository.rename_space(missing, "").unwrap_err().code,
        "space.not_found"
    );
    assert_eq!(
        repository.delete_space(missing).unwrap_err().code,
        "space.not_found"
    );
}
