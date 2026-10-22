//! The port the host reaches a plugin's working half through.
//!
//! Why a port rather than the wasm instance itself: the host's rules — what
//! happens when a plugin throws, is interrupted, or answers something the
//! kernel cannot read — are the part worth holding still, and they can only be
//! exercised against a body a test can make. The real one is a resident store on
//! a thread of its own (ADR 0044), which arrives with #87; this is the whole of
//! what the host knows about it.
//!
//! # The contract: a call must come back inside its deadline
//!
//! **A `handle` that does not return is a kernel thread that does not return.**
//! The host keeps no timer of its own and starts no thread per call, so there is
//! nothing behind this port that will cut a call off: coming back is the
//! implementor's obligation, not something the host backstops. The reason that
//! has to be written down rather than assumed is the blind spot ADR 0044 §6
//! records — epoch and fuel stop a plugin's own instructions and nothing else,
//! so a plugin blocked inside a host function is beyond what the plugin's own
//! limits can reach.
//!
//! This matters more than an ordinary misbehaviour, because of what it costs:
//! "the plugin failed" is a call the kernel went on without, and "the plugin
//! never came back" is the whole application not moving, which the user has no
//! way to act on. 「插件失败绝不阻塞内核流程」 is the non-negotiable line (spec #82
//! 「失败与降级」), and a call that cannot be cut off is the one way a plugin
//! could cross it.
//!
//! Three mechanisms keep a call bounded, one per stretch of it, and **none of
//! them is a thread per call** (ADR 0044 §2 — a plugin's body is already one
//! dedicated thread with a resident store):
//!
//! - **The plugin's own instructions** — epoch and fuel, set on its store
//!   (ADR 0044 §4). The only one of the three that stops code which is running.
//! - **The runner waiting on its own thread** — a bounded receive, the shape of
//!   `recv_timeout` on whatever the plugin's thread answers through. A plugin
//!   thread that never answers must not become a caller that never returns.
//! - **The plugin waiting inside a host function** — the timeout around
//!   `Func::call_async` (ADR 0044 §5). Making host functions async is exactly
//!   what makes that wait interruptible; it is the stretch §6 names as the one
//!   the other two cannot cover.
//!
//! All three end the same way for a caller, and that is [`RunnerError::TimedOut`].
//! What the host owes is what comes after: the call said nothing, the kernel
//! goes on, and the failure is reported once.

/// Why a call to a plugin's body did not produce an answer.
#[derive(Debug)]
pub(crate) enum RunnerError {
    /// The plugin's own code failed: it threw, or its instance trapped.
    ///
    /// The text is the diagnostic that goes to the log beside the failure's
    /// `errorId`; it is not shown to the user, whose message is written from
    /// the code and its params like every other message in this application.
    Failed(String),
    /// The call ran past its deadline and is over.
    ///
    /// Which deadline is not this variant's business: all three ways a call is
    /// kept bounded end here (see this module's docs) — epoch or fuel stopping
    /// the plugin's own code (ADR 0044 §4), the runner giving up on the thread
    /// it was waiting on, or the timeout around a host call the plugin is
    /// blocked in (ADR 0044 §5).
    ///
    /// It is not "the plugin was killed". Under the second of those the plugin's
    /// thread may still be busy with the call nobody is waiting for any more;
    /// what is over is this call. A plugin that keeps doing it is taken out of
    /// the rotation by the host, which is what stops a stuck plugin from being
    /// asked again.
    TimedOut,
}

/// One plugin's working half, as the host holds it.
///
/// One entry, `handle(method, payload)`, rather than a method per mount point:
/// the kernel forwards and measures and does not interpret `method`, so which
/// methods a body answers is between the plugin and the mount points it
/// declared (ADR 0044 §3). What the host does read is the answer to the mount
/// points the kernel owns, because merging those answers is the kernel's rule.
pub(crate) trait Runner: Send + Sync {
    /// Answers one call, or says why it could not.
    ///
    /// `method` is a mount point's key from the catalog and `payload` is that
    /// mount point's params as JSON; the answer is its result as JSON.
    ///
    /// **It must return inside the call's deadline**, by whichever of the three
    /// mechanisms this module's docs name. The host waits as long as this takes
    /// and has nothing to cut it off with, so an implementation that can block
    /// without bound turns a plugin failure into an application that has
    /// stopped. `Err(RunnerError::TimedOut)` is how an implementation reports
    /// that its deadline ran out; the host treats that exactly like any other
    /// failure — the call said nothing and the kernel goes on.
    fn handle(&self, method: &str, payload: &str) -> Result<String, RunnerError>;

    /// Tells the body that its plugin is out of the rotation, so anything it has
    /// parked — a background loop waiting for work — can finish.
    ///
    /// A default that does nothing, because most bodies have nothing to wake: a
    /// body that only ever answers calls is already idle between them. It is the
    /// one that blocks *inside* a call that needs it, and it is the only moment
    /// the host can reach that call at all — the call channel is held while it
    /// runs. What a stop means for the running call is the implementation's: the
    /// plugin's `task_wait` answers "stop" (see `wasm::tasks`), so a loop built
    /// on it finishes at its next turn rather than waiting out a timeout.
    fn stop(&self) {}
}
