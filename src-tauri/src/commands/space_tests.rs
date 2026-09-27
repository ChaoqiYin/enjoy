use super::space::changing_spaces;
use crate::app::AppState;
use crate::repository::fixture::{Fixture, FIRST_SPACE};
use crate::repository::{lock_shared, Repository};
use crate::scan::control::ScanControl;
use crate::update::UpdateControl;
use std::sync::{Arc, Mutex};

/// A state a test can hold, which is the whole point of the state being a plain
/// struct: `State<'_, AppState>` is made by Tauri from a running application,
/// and a rule that can only be reached through one can only be verified in a
/// window.
fn state(fixture: &Fixture) -> (AppState, Arc<ScanControl>) {
    let repository = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let scan = Arc::new(ScanControl::default());
    (
        AppState {
            scan: Arc::clone(&scan),
            repository: Arc::new(Mutex::new(repository)),
            update: Arc::new(UpdateControl::default()),
        },
        scan,
    )
}

#[test]
fn a_space_change_is_refused_while_a_media_task_holds_the_slot() {
    let fixture = Fixture::new();
    let (state, scan) = state(&fixture);
    let guard = scan.begin().unwrap();
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
    let (state, _scan) = state(&fixture);
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
