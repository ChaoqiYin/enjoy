use super::space::changing_spaces;
use crate::app::test_state;
use crate::repository::fixture::Fixture;
use crate::repository::lock_shared;

#[test]
fn a_space_change_is_refused_while_a_media_task_holds_the_slot() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let guard = state.scan.begin().unwrap();
    let error =
        changing_spaces(&state, |repository| repository.create_space("Another")).unwrap_err();
    assert_eq!(error.code, "space.blocked.scanning");
    drop(guard);
    // Refused before the index was reached, not after: the space is not there.
    assert_eq!(
        lock_shared(&state.repository)
            .unwrap()
            .spaces()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn the_same_change_goes_through_when_the_slot_is_free() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
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
