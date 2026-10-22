use super::space::changing_spaces;
use crate::app::test_state;
use crate::repository::fixture::Fixture;
use crate::repository::lock_shared;

#[test]
fn a_space_change_goes_through_while_a_media_task_is_running() {
    // The slot used to refuse this. A media task carries the space it was
    // started on and writes where it meant to (ADR 0012), so the user may move
    // away in the middle of a pass and watch a different space while it runs
    // (spec #101).
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let _running = state.scan.begin();

    changing_spaces(&state, |repository| repository.create_space("Another")).unwrap();
    assert_eq!(
        lock_shared(&state.repository)
            .unwrap()
            .spaces()
            .unwrap()
            .len(),
        2
    );
}
