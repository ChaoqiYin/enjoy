use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

/// The name a test database's first space is created with. Nothing in these
/// tests is about names, so the value only has to be a name; the ones that are
/// about names pass their own.
pub(crate) const FIRST_SPACE: &str = "Test library";

static NEXT: AtomicU64 = AtomicU64::new(0);

/// A temporary directory a test builds a library in, removed when it drops.
/// Shared by every repository test module, so the harness lives on its own
/// rather than inside whichever of them happens to be largest.
pub(crate) struct Fixture(pub(crate) PathBuf);

impl Fixture {
    pub(crate) fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "enjoy-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(fs::canonicalize(path).unwrap())
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
