use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use super::Repository;

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

    /// A library in this directory, holding the one space a library is created
    /// with.
    ///
    /// The fixture used to stop at the directory, and every test that wanted a
    /// library wrote the same three lines out: open the database beside the
    /// directory, ask which space it was created with, render the directory the
    /// way a scan command spells it. Sixty of those, none of which said anything
    /// a reader needed, and each one a chance to spell the database or the root
    /// differently from its neighbours.
    pub(crate) fn library(&self) -> Library {
        let repository = Repository::open(&self.0.join("library.db"), FIRST_SPACE).unwrap();
        let space = repository.current_space().unwrap().id;
        Library { repository, space }
    }
}

/// What a test is given when it wants a library rather than a directory: the
/// connection, and the space a new library holds — the two things a test asks
/// for before it can ask anything of the library.
///
/// It destructures, so a test names them the way it always did:
/// `let Library { mut repository, space } = fixture.library();`
pub(crate) struct Library {
    pub(crate) repository: Repository,
    /// The only space there is until a test makes another. Named here rather
    /// than looked up per test because the lookup is the same everywhere: a
    /// library is created with one space, and the space a test wants is that
    /// one until it creates another itself.
    pub(crate) space: i64,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
