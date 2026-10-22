//! The queue's front door: a piece of work goes in under its key, and the same
//! key does not go in twice while it is still queued.

use crate::model::TaskState;
use crate::repository::fixture::{Fixture, Library};

/// Puts a record under the id a test wants its task to hang off. A task's
/// `video_id` is a real reference, so the record has to be there — laid down
/// directly rather than scanned in, because a record's own columns are not
/// what any of this is about (same as `fixture::video_fields`).
fn video(repository: &crate::repository::Repository, id: i64) {
    let space = repository.current_space().unwrap().id;
    repository
        .connection
        .execute(
            "INSERT OR IGNORE INTO videos (id,space_id,path,file_name,folder_path,\
             file_size,modified_at,created_at,updated_at) \
             VALUES (?1,?2,?3,?4,?5,0,0,0,0)",
            rusqlite::params![
                id,
                space,
                format!("/videos/{id}.mkv"),
                format!("{id}.mkv"),
                "/videos"
            ],
        )
        .unwrap();
}

/// Puts one task row in with a given state and schedule, without going through
/// the queue's own writes. The state and schedule variants the questions ask
/// about are set up this way rather than reached by driving the state machine,
/// because what is under test is the queue's reads, not how a row got where it
/// is.
fn insert_state(
    repository: &crate::repository::Repository,
    plugin: Option<&str>,
    video: Option<i64>,
    kind: &str,
    state: &str,
    available_at: i64,
) -> i64 {
    let space = repository.current_space().unwrap().id;
    repository
        .connection
        .execute(
            "INSERT INTO tasks (plugin,space_id,video_id,kind,payload,state,
                available_at,created_at,updated_at)
             VALUES (?1,?2,?3,?4,'{}',?5,?6,0,0)",
            rusqlite::params![plugin, space, video, kind, state, available_at],
        )
        .unwrap();
    repository.connection.last_insert_rowid()
}

#[test]
fn a_pushed_task_comes_back_out() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    video(&repository, 7);

    let id = repository
        .push_task(None, space, Some(7), "scan", "{\"deep\":true}")
        .unwrap();

    let task = repository.task(id).unwrap();
    assert_eq!(task.plugin, None, "NULL plugin is the kernel's own queue");
    assert_eq!(task.space_id, space);
    assert_eq!(task.video_id, Some(7));
    assert_eq!(task.kind, "scan");
    assert_eq!(task.payload, "{\"deep\":true}", "stored as given, unread");
    assert_eq!(task.state, TaskState::Pending);
    assert_eq!(task.attempts, 0);
}

#[test]
fn the_same_key_enqueues_only_once() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    video(&repository, 7);

    let first = repository
        .push_task(Some("scraper"), space, Some(7), "scrape", "{}")
        .unwrap();
    let second = repository
        .push_task(
            Some("scraper"),
            space,
            Some(7),
            "scrape",
            "{\"path\":\"x\"}",
        )
        .unwrap();

    assert_eq!(
        first, second,
        "repeating a click returns the task already queued, not a second one"
    );
    assert_eq!(
        repository.task(first).unwrap().payload,
        "{}",
        "the payload is the one the first enqueue brought"
    );
}

#[test]
fn owner_video_and_kind_each_split_the_key() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    video(&repository, 7);
    video(&repository, 8);

    let kernel = repository
        .push_task(None, space, Some(7), "scrape", "{}")
        .unwrap();
    let plugin = repository
        .push_task(Some("scraper"), space, Some(7), "scrape", "{}")
        .unwrap();
    let other_video = repository
        .push_task(None, space, Some(8), "scrape", "{}")
        .unwrap();
    let other_kind = repository
        .push_task(None, space, Some(7), "refresh", "{}")
        .unwrap();

    let ids = [kernel, plugin, other_video, other_kind];
    for (index, id) in ids.iter().enumerate() {
        assert!(
            !ids[..index].contains(id),
            "each half of the key splits the queue: {ids:?}"
        );
    }
}

#[test]
fn a_task_without_a_video_dedups_on_its_own_key() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();

    let first = repository
        .push_task(None, space, None, "scan", "{}")
        .unwrap();
    let second = repository
        .push_task(None, space, None, "scan", "{\"x\":1}")
        .unwrap();

    assert_eq!(
        first, second,
        "no video is a key of its own, not a wildcard"
    );
}

#[test]
fn any_state_that_is_not_finished_holds_the_key() {
    for state in ["pending", "running", "paused"] {
        let fixture = Fixture::new();
        let Library { mut repository, .. } = fixture.library();
        video(&repository, 7);
        let held = insert_state(&repository, Some("scraper"), Some(7), "scrape", state, 0);
        let space = repository.current_space().unwrap().id;
        let pushed = repository
            .push_task(Some("scraper"), space, Some(7), "scrape", "{}")
            .unwrap();
        assert_eq!(
            pushed, held,
            "a task in {state} is still queued, so its key is taken"
        );
    }
}

#[test]
fn a_finished_task_frees_its_key() {
    for state in ["done", "failed", "cancelled"] {
        let fixture = Fixture::new();
        let Library { mut repository, .. } = fixture.library();
        video(&repository, 7);
        let held = insert_state(&repository, Some("scraper"), Some(7), "scrape", state, 0);
        let space = repository.current_space().unwrap().id;
        let pushed = repository
            .push_task(Some("scraper"), space, Some(7), "scrape", "{}")
            .unwrap();
        assert_ne!(
            pushed, held,
            "a task in {state} is finished, so its key is free again"
        );
    }
}

#[test]
fn claiming_marks_the_task_running_and_counts_the_attempt() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();

    let id = repository
        .push_task(None, space, None, "scan", "{}")
        .unwrap();
    let before = crate::repository::now();
    let claimed = repository.claim_task(None).unwrap();
    let after = crate::repository::now();

    let claimed = claimed.expect("the queued task is runnable");
    assert_eq!(claimed.id, id);
    assert_eq!(claimed.state, TaskState::Running);
    assert_eq!(claimed.attempts, 1, "one claim is one attempt");
    let started = claimed.started_at.expect("a claimed task has a start time");
    assert!(
        (before..=after).contains(&started),
        "the start time is now, not the queue time"
    );
    assert!(
        repository.claim_task(None).unwrap().is_none(),
        "the owner has no second piece of work"
    );
}

#[test]
fn every_claim_counts_another_attempt() {
    let fixture = Fixture::new();
    let Library { mut repository, .. } = fixture.library();

    let id = insert_state(&repository, None, None, "scan", "pending", 0);
    let first = repository.claim_task(None).unwrap().unwrap();
    assert_eq!(first.attempts, 1);
    // Back to pending by whatever route put it there before — the count is
    // this read's to make, not the state machine's to preserve.
    repository
        .connection
        .execute("UPDATE tasks SET state='pending' WHERE id=?1", [id])
        .unwrap();

    let second = repository.claim_task(None).unwrap().unwrap();

    assert_eq!(second.attempts, 2, "each claim is one more attempt");
}

#[test]
fn the_earliest_ready_task_is_the_one_claimed() {
    let fixture = Fixture::new();
    let Library { mut repository, .. } = fixture.library();

    let now = crate::repository::now();
    let earlier = insert_state(&repository, None, None, "scan", "pending", now - 1000);
    let later = insert_state(&repository, None, None, "thumbnails", "pending", now - 500);

    let first = repository.claim_task(None).unwrap().unwrap();
    let second = repository.claim_task(None).unwrap().unwrap();

    assert_eq!(
        first.id, earlier,
        "the one that has waited longest goes first"
    );
    assert_eq!(second.id, later);
}

#[test]
fn a_task_scheduled_for_later_is_not_claimed_yet() {
    let fixture = Fixture::new();
    let Library { mut repository, .. } = fixture.library();

    insert_state(
        &repository,
        None,
        None,
        "scan",
        "pending",
        crate::repository::now() + 60_000,
    );

    assert!(
        repository.claim_task(None).unwrap().is_none(),
        "available_at has not arrived, so there is nothing to run"
    );
}

#[test]
fn paused_tasks_are_never_claimed() {
    let fixture = Fixture::new();
    let Library { mut repository, .. } = fixture.library();

    let paused = insert_state(&repository, None, None, "thumbnails", "paused", 0);
    let pending = insert_state(&repository, None, None, "scan", "pending", 0);

    let claimed = repository.claim_task(None).unwrap().unwrap();
    assert_eq!(claimed.id, pending, "paused is stepped out of the queue");
    assert!(
        repository.claim_task(None).unwrap().is_none(),
        "and stays out until it is resumed"
    );
    assert_eq!(repository.task(paused).unwrap().state, TaskState::Paused);
}

#[test]
fn each_owner_claims_only_its_own_work() {
    let fixture = Fixture::new();
    let Library { mut repository, .. } = fixture.library();

    let kernel = insert_state(&repository, None, None, "scan", "pending", 0);
    let plugin = insert_state(&repository, Some("scraper"), None, "scrape", "pending", 0);

    let claimed_by_kernel = repository.claim_task(None).unwrap().unwrap();
    let claimed_by_plugin = repository.claim_task(Some("scraper")).unwrap().unwrap();

    assert_eq!(
        claimed_by_kernel.id, kernel,
        "the kernel never sees plugin work"
    );
    assert_eq!(
        claimed_by_plugin.id, plugin,
        "a plugin never sees the kernel's"
    );
    assert!(
        repository
            .claim_task(Some("other-plugin"))
            .unwrap()
            .is_none(),
        "and never another plugin's"
    );
}

#[test]
fn removing_a_video_takes_its_tasks_with_it() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    video(&repository, 7);
    let id = repository
        .push_task(Some("scraper"), space, Some(7), "scrape", "{}")
        .unwrap();

    repository.remove(space, "/videos/7.mkv").unwrap();

    assert_eq!(
        repository.task(id).unwrap_err().code,
        "task.not_found",
        "a task about a record that is gone has nothing left to say"
    );
}

#[test]
fn deleting_a_space_takes_its_tasks_with_it() {
    let fixture = Fixture::new();
    let Library { mut repository, .. } = fixture.library();
    let second = repository.create_space("Second").unwrap().id;
    let id = repository
        .push_task(Some("scraper"), second, None, "scrape", "{}")
        .unwrap();

    repository.delete_space(second).unwrap();

    assert_eq!(repository.task(id).unwrap_err().code, "task.not_found");
}

#[test]
fn the_install_gate_sees_a_media_task_that_is_waiting_or_running() {
    // Installing exits the process, so any media task still to come would lose
    // its work — not only the one the user happens to be watching (spec #101).
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();

    assert!(!repository.has_open_kernel_tasks().unwrap());
    repository
        .push_task(None, space, None, "scan", "{}")
        .unwrap();

    assert!(repository.has_open_kernel_tasks().unwrap());
}

#[test]
fn the_install_gate_ignores_a_plugin_s_own_queue() {
    // A plugin's tasks are not this application's media work: they are run by
    // the plugin's host, which the installer does not take away.
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    repository
        .push_task(Some("com.example.one"), space, None, "scrape", "{}")
        .unwrap();

    assert!(!repository.has_open_kernel_tasks().unwrap());
}

#[test]
fn the_install_gate_ignores_a_media_task_that_is_already_over() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    let id = repository
        .push_task(None, space, None, "scan", "{}")
        .unwrap();
    repository.claim_task(None).unwrap();
    repository.complete_task(id).unwrap();

    assert!(!repository.has_open_kernel_tasks().unwrap());
}

#[test]
fn the_install_gate_counts_a_paused_media_task_as_still_to_come() {
    // The user stopped it for now and means to resume it: installing over that
    // loses the same work as installing over a running pass.
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    let id = repository
        .push_task(None, space, None, "scan", "{}")
        .unwrap();
    repository.request_task_pause(id).unwrap();

    assert!(repository.has_open_kernel_tasks().unwrap());
}
