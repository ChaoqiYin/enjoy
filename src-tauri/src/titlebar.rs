//! What the window's own titlebar is told about the window.
//!
//! The window is created without decorations (`tauri.conf.json`), so the three
//! buttons in its corner are drawn by the interface — and so is the picture on
//! the middle one, which is a square while the window can still be made bigger
//! and two overlapping squares once it has been. Which of the two is true is a
//! fact only the system holds, and the interface cannot ask for it without
//! reaching into `@tauri-apps/api/window` — the reach `scripts/check-permissions.mjs`
//! exists to catch, and the one ADR 0037 turned `show()` into a command to
//! avoid. So the backend measures it and tells.
//!
//! What it measures is the window's own event, not the call that was made.
//! `WindowEvent::Resized` arrives for every change of size, including the ones
//! no button of ours caused: a double click on the title (Tauri's own drag
//! script answers that), Win+Up, a window dragged to the edge of the screen.
//! Reading the state from the window is what covers all of them at once.
//!
//! Between the measuring and the telling there is one rule, and it is this
//! module: `Resized` arrives on every frame of a drag, so a window resized by
//! hand would otherwise tell the interface the same answer sixty times a second.
//! The rule and the telling are one call for the reason `closing`'s are — what a
//! test cannot make is the window, and what it can make is the sink, so what is
//! left for a test to be unable to check is as little as possible.

use crate::events::Events;
use std::sync::Mutex;

/// The window's own state, as the interface is told about it.
///
/// One field so far, and it is not a record of the window: it is a record of
/// what has been *said*, which is the only thing the rule above needs.
#[derive(Default)]
pub(crate) struct Titlebar {
    /// The last answer the interface was given, or `None` while nothing has
    /// been said. The distinction is why this is an `Option` rather than a
    /// `bool` defaulting to false: the interface starts out drawing the square,
    /// and the first measurement is worth sending whatever it says, because
    /// nothing else has confirmed that the square is the right picture.
    maximized: Mutex<Option<bool>>,
}

impl Titlebar {
    /// What a window that has just been measured is worth telling the
    /// interface: the answer, or nothing when it is the one already sent.
    pub(crate) fn report(&self, maximized: bool, events: &impl Events) {
        // A poisoned lock is one a panicking thread left behind, and what it
        // left behind is still the state — the same reading `share`'s control
        // takes.
        let mut said = self
            .maximized
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if *said == Some(maximized) {
            return;
        }
        *said = Some(maximized);
        events.window_maximized(maximized);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::Recorded;

    #[test]
    fn the_first_measurement_is_always_said() {
        // Not because the window is expected to start maximized — it is not,
        // the configuration asks for neither — but because nothing has said
        // otherwise yet, and an interface drawing the square on the strength of
        // its own default is being guessed at rather than told.
        let events = Recorded::default();
        Titlebar::default().report(true, &events);
        assert_eq!(events.maximized(), vec![true]);

        let events = Recorded::default();
        Titlebar::default().report(false, &events);
        assert_eq!(events.maximized(), vec![false]);
    }

    #[test]
    fn a_window_standing_still_says_nothing() {
        // The frames of a drag: the same size reported until it stops, and every
        // one of them after the first is the answer the interface already has.
        let events = Recorded::default();
        let titlebar = Titlebar::default();
        for _ in 0..61 {
            titlebar.report(false, &events);
        }
        assert_eq!(events.maximized(), vec![false]);
    }

    #[test]
    fn a_maximize_and_a_restore_are_each_worth_saying_once() {
        // What a double click on the title, Win+Up and a drag to the top of the
        // screen all end in: a size change, and one thing to tell — in the order
        // they happened, since the interface is left showing the last of them.
        let events = Recorded::default();
        let titlebar = Titlebar::default();
        for maximized in [false, false, true, true, true, false, false] {
            titlebar.report(maximized, &events);
        }
        assert_eq!(events.maximized(), vec![false, true, false]);
    }
}
