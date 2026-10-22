//! What the task page is given: every task in every space, joined to the
//! names it draws, with finished work aged out after its week.

use crate::model::TaskRow;
use crate::repository::fixture::{Fixture, Library, FIRST_SPACE};
use crate::repository::now;

/// Puts a task row in with a given state, timestamps, and owner, the way an
/// earlier session would have left it — the page reads rows the queue's own
/// writes and other callers' both produce, so the tests lay them down
/// directly.
fn insert(
    repository: &crate::repository::Repository,
    plugin: Option<&str>,
    space_id: i64,
    video_id: Option<i64>,
    state: &str,
    updated_at: i64,
    finished_at: Option<i64>,
) -> i64 {
    repository
        .connection
        .execute(
            "INSERT INTO tasks (plugin,space_id,video_id,kind,payload,state,
                attempts,available_at,created_at,updated_at,finished_at)
             VALUES (?1,?2,?3,'scan','{}',?4,0,0,0,?5,?6)",
            rusqlite::params![plugin, space_id, video_id, state, updated_at, finished_at],
        )
        .unwrap();
    repository.connection.last_insert_rowid()
}

#[test]
fn unfinished_tasks_come_first_and_terminal_ones_by_their_finish() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    let touched = now() - 30 * 60 * 1000;
    let recent_finish = now() - 8 * 60 * 1000;
    let older_finish = now() - 10 * 60 * 1000;
    let old_done = insert(
        &repository,
        None,
        space,
        None,
        "done",
        touched,
        Some(older_finish),
    );
    let recent_done = insert(
        &repository,
        None,
        space,
        None,
        "done",
        touched,
        Some(recent_finish),
    );
    let waiting = insert(&repository, None, space, None, "pending", touched, None);
    let running = insert(&repository, None, space, None, "running", now(), None);

    let rows = repository.list_tasks().unwrap();
    let order: Vec<i64> = rows.iter().map(|row| row.id).collect();

    assert_eq!(
        order,
        vec![running, waiting, recent_done, old_done],
        "work to do is drawn above work that finished, and finished work by how recently it finished"
    );
}

#[test]
fn a_row_carries_its_space_name_and_its_video() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    let second = repository.create_space("Elsewhere").unwrap().id;
    repository
        .connection
        .execute(
            "INSERT INTO videos (id,space_id,path,file_name,folder_path,file_size,
                modified_at,created_at,updated_at)
             VALUES (7,?1,'/v/7.mkv','7.mkv','/v',0,0,0,0)",
            [space],
        )
        .unwrap();
    let with_video = insert(
        &repository,
        Some("com.example.one"),
        space,
        Some(7),
        "running",
        now(),
        None,
    );
    let other_space = insert(&repository, None, second, None, "pending", now(), None);

    let rows = repository.list_tasks().unwrap();

    let video_task = rows.iter().find(|row| row.id == with_video).unwrap();
    assert_eq!(video_task.space_name, FIRST_SPACE);
    assert_eq!(video_task.video_id, Some(7));
    assert_eq!(video_task.video_name.as_deref(), Some("7.mkv"));
    assert_eq!(video_task.plugin.as_deref(), Some("com.example.one"));
    assert_eq!(video_task.state, "running");

    let space_task = rows.iter().find(|row| row.id == other_space).unwrap();
    assert_eq!(space_task.space_name, "Elsewhere");
    assert_eq!(space_task.video_name, None);
}

#[test]
fn finished_tasks_older_than_a_week_are_not_drawn_and_unfinished_ones_are() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    let week = 7 * 24 * 60 * 60 * 1000;
    let old_done = insert(
        &repository,
        None,
        space,
        None,
        "done",
        0,
        Some(now() - week - 1),
    );
    let kept_done = insert(
        &repository,
        None,
        space,
        None,
        "done",
        0,
        Some(now() - 60_000),
    );
    let ancient_pending = insert(&repository, None, space, None, "pending", 0, None);

    let rows = repository.list_tasks().unwrap();
    let ids: Vec<i64> = rows.iter().map(|row| row.id).collect();

    assert!(
        !ids.contains(&old_done),
        "a finished task past its week is aged out of the page the same way it is out of the table"
    );
    assert!(ids.contains(&kept_done));
    assert!(
        ids.contains(&ancient_pending),
        "the retention is a display promise for finished work, not a deadline for work still to do"
    );
}

#[test]
fn a_row_is_what_the_page_draws_and_nothing_the_page_does_not() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    let id = insert(&repository, None, space, None, "pending", now(), None);

    let rows = repository.list_tasks().unwrap();
    let row: &TaskRow = rows.iter().find(|row| row.id == id).unwrap();

    assert_eq!(row.kind, "scan");
    assert_eq!(row.attempts, 0);
    assert_eq!(row.progress_current, None);
    assert_eq!(row.last_error, None);
}
