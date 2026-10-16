//! The port the host reaches a plugin's working half through.
//!
//! Why a port rather than the wasm instance itself: the host's rules — what
//! happens when a plugin throws, is interrupted, or answers something the
//! kernel cannot read — are the part worth holding still, and they can only be
//! exercised against a body a test can make. The real one is a resident store on
//! a thread of its own (ADR 0044), which arrives with #87; this is the whole of
//! what the host knows about it.

/// Why a call to a plugin's body did not produce an answer.
#[derive(Debug)]
pub(crate) enum RunnerError {
    /// The plugin's own code failed: it threw, or its instance trapped.
    ///
    /// The text is the diagnostic that goes to the log beside the failure's
    /// `errorId`; it is not shown to the user, whose message is written from
    /// the code and its params like every other message in this application.
    Failed(String),
    /// The plugin ran past its deadline and was interrupted.
    ///
    /// The interruption is the body's own — epoch and fuel inside its store
    /// (ADR 0044 §4) — because the host has no way to stop code it is waiting
    /// on, and a thread per call is not the shape this design chose (ADR 0044
    /// §2). What the host owes is what happens next, and that is the same as
    /// for any other failure: the call said nothing, and the kernel goes on.
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
    fn handle(&self, method: &str, payload: &str) -> Result<String, RunnerError>;
}
