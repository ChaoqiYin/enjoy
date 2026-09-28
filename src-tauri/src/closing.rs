//! What a request to close the window means.
//!
//! Closing the window while the 共享服务 is running ends connections a device may
//! be in the middle of reading a film over, so the user is asked before it
//! happens: hold the close, ask, and — if the answer is yes — end the service and
//! close the window. That much was always the behaviour; what this module is
//! about is **who decides it**.
//!
//! It used to be decided on the interface's side of the seam, and what made it
//! work was spread over six places: when the interface subscribed to the window's
//! close-requested event, whether it held the close, who destroyed the window
//! afterwards, which permission the capability file granted, which entry the
//! permission check knew about, and why the window had to be destroyed rather
//! than closed. Only the permission had a check behind it; the rest was held by
//! comments and by one test. Two releases in a row shipped a window that could
//! not be closed, each for a different one of those six.
//!
//! So the decision moved here, next to the fact it rests on: the backend is the
//! one that knows whether a service is running. The interface asks Tauri nothing
//! about its own window any more — no subscription, no destroy, no permission to
//! destroy — and it is told about a held close the same way it is told about
//! everything else the backend does.
//!
//! What arrives here is a close the window has already let be held: the caller
//! hands in the holding itself, because only Tauri can hold a window. Everything
//! else — whether to hold, and what to say — is decided and done in one place,
//! and the tests below hold it to that without a window.

use crate::events::Events;
use crate::share::ShareControl;

/// What is done with a request to close the window.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Answer {
    /// Let it through: nothing is being offered, so there is nothing to ask.
    Proceed,
    /// Hold it and ask: a service is running, and closing the window now ends
    /// connections a device may be in the middle of reading.
    Ask,
}

/// What a request to close the window does, given what is running.
///
/// `hold` is the close itself, which only the caller the window belongs to can
/// hold; `events` is how the interface is told a question is due. Both are
/// handed in rather than reached for, which is the whole of what makes this
/// testable: the rule is one line, and the two things it acts on are the two
/// things a test cannot make.
pub(crate) fn handle(share: &ShareControl, events: &impl Events, hold: impl FnOnce()) -> Answer {
    if !share.running() {
        return Answer::Proceed;
    }
    hold();
    events.close_requested();
    Answer::Ask
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::Recorded;
    use crate::share::harness::the_machine_ports;

    #[test]
    fn nothing_running_means_the_close_goes_through_unannounced() {
        // No question, no held window, and nothing said: a window that has never
        // offered anything has nothing to warn the user about.
        let events = Recorded::default();
        let mut held = false;
        let answer = handle(&ShareControl::default(), &events, || held = true);
        assert_eq!(answer, Answer::Proceed);
        assert!(!held, "a close was held with nothing serving");
        assert_eq!(events.close_requests(), 0);
    }

    #[test]
    fn a_running_service_means_the_close_is_held_and_the_interface_is_told() {
        // A real service on a real port, because what is being asked is exactly
        // whether one is there — and every test that starts one takes the
        // machine's ports first, or two of them take each other's (`share::harness`).
        let _ports = the_machine_ports();
        let control = ShareControl::default();
        let credentials = crate::share::credentials::Credentials {
            username: "enjoy".to_string(),
            password: "treasure".to_string(),
        };
        control
            .open(None, "en", &[], credentials.clone(), Vec::new())
            .unwrap();

        let events = Recorded::default();
        let mut held = false;
        let answer = handle(&control, &events, || held = true);
        assert_eq!(answer, Answer::Ask);
        assert!(held, "the close went through with a service running");
        assert_eq!(events.close_requests(), 1);

        // And the question ends with the service: ended from the page, the next
        // close goes through the ordinary way and nobody is asked.
        control.close(&credentials, Vec::new());
        let later = Recorded::default();
        let mut held = false;
        assert_eq!(handle(&control, &later, || held = true), Answer::Proceed);
        assert!(!held);
        assert_eq!(later.close_requests(), 0);
    }
}
