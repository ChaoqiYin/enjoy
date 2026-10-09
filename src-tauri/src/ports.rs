//! The machine's ports, as the tests of this binary share them.
//!
//! `cargo test` runs the tests of one binary in parallel threads, and the ports
//! of one machine are a single thing they all share. Two tests that ask the
//! system for a free port at the same moment can be handed the same number; a
//! test that has just released a port can watch another test's server take it;
//! and a test that names a port and expects a service to end up on exactly that
//! one is measuring the other tests as much as the service. What that looks like
//! is a suite that is green here and red on a runner that happened to schedule
//! three of them side by side — which is how `!listening(taken)`,
//! `!listening(port)` and `Some(49221)` came out of CI on a commit that passed
//! on this machine.
//!
//! So every test that starts a service, starts an HTTP server for a download, or
//! asks whether something is listening on a port takes this first — whichever
//! module it belongs to, which is why it lives here rather than inside the 共享
//! service's own harness. The download tests are the ones that made that
//! necessary: each of them serves a file from a loopback port for as long as the
//! test binary lives, and none of them knew about the lock the sharing tests
//! were already passing around.
//!
//! A test that fails while holding it poisons it, which is why the guard is
//! taken through `unwrap_or_else`: one failure should not turn the rest of the
//! run into a second failure.
//!
//! Coarse on purpose. The alternative — a lock per port range — is a lock per
//! test, since what each of them needs is that no other test takes the port it
//! is about, and that is every other test here.

use std::sync::{Mutex, MutexGuard};

static PORTS: Mutex<()> = Mutex::new(());

/// Held for the length of one test that uses the machine's ports.
pub(crate) fn the_machine_ports() -> MutexGuard<'static, ()> {
    PORTS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
