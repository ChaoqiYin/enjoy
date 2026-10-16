//! What each call cost, and how it ended.
//!
//! Two readers: the status line, which has to be able to say what a plugin is
//! doing and how it is going, and the diagnostics, where "this plugin is slow"
//! is a different report from "this plugin is wrong". Both are facts about
//! calls that have already happened, which is all this holds.

use std::collections::VecDeque;
use std::time::Duration;

/// How one call to a plugin's body ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CallOutcome {
    /// The body answered, and the kernel could read the answer.
    Answered,
    /// The body threw, or answered something the kernel could not read.
    Failed,
    /// The body ran past its deadline and was interrupted.
    TimedOut,
}

/// One call to one plugin at one mount point.
#[derive(Debug, Clone)]
pub(crate) struct CallRecord {
    pub plugin: String,
    /// The mount point's catalog key.
    pub mount_point: &'static str,
    pub outcome: CallOutcome,
    pub elapsed: Duration,
}

/// How many calls are kept.
///
/// A bound rather than everything ever: a mount point is asked on every render
/// of a list, so an unbounded history is a leak whose size is the user's
/// patience with scrolling. What the status line and a diagnostic need is the
/// recent past, and the log holds the rest.
const REMEMBERED: usize = 200;

/// The calls that have been made, oldest first.
#[derive(Default)]
pub(crate) struct Metrics {
    recent: VecDeque<CallRecord>,
}

impl Metrics {
    pub(crate) fn record(&mut self, call: CallRecord) {
        if self.recent.len() == REMEMBERED {
            self.recent.pop_front();
        }
        self.recent.push_back(call);
    }

    pub(crate) fn recent(&self) -> Vec<CallRecord> {
        self.recent.iter().cloned().collect()
    }
}
