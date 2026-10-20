//! The `storage` capability: one plugin's own directory, and nothing outside it.
//!
//! A plugin gets one file at a time, by a name that is one component: no
//! separators, no `..`, nothing absolute. That is narrower than the file system
//! allows, and it is the whole of the confinement — there is no path to check
//! for escape because a path is not a thing this capability accepts (see
//! [`inside`]).
//!
//! A write is atomic: the bytes go to a temporary file in the same directory,
//! and a rename puts them in place. The point is what the plugin's own data
//! directory means — it is a cache the plugin rebuilds, and a plugin whose body
//! is stopped mid-call (a background instance that is being switched off, a
//! thread the kernel gave up on) must not leave a half-written file that looks
//! like a complete one to the next call. A rename within one directory is a
//! single file-system operation, so a reader sees the old file or the new one
//! and never a mixture.

use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use wasmtime::Caller;

use super::imports::Guest;
use super::memory::{put, text};

/// Reads one file out of the plugin's own directory.
pub(super) fn storage_read(
    caller: &mut Caller<'_, Guest>,
    name_at: i32,
    name_len: i32,
    out: i32,
    cap: i32,
) -> Result<i32, wasmtime::Error> {
    let name = text(caller, name_at, name_len)?;
    let Some(path) = inside(caller.data().data_dir(), &name) else {
        return Ok(-1);
    };
    match std::fs::read(&path) {
        Ok(bytes) => {
            put(caller, out, cap, &bytes)?;
            Ok(bytes.len() as i32)
        }
        Err(error) => {
            // A file that is not there is an ordinary answer — a plugin asking
            // whether it has fetched something before — and is not worth a line
            // in the log. Anything else is the machine's, and is.
            if error.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!(plugin = caller.data().plugin(), path = %path.display(), %error, "A plugin's file could not be read");
            }
            Ok(-1)
        }
    }
}

/// Writes one file into the plugin's own directory, whole or not at all.
pub(super) fn storage_write(
    caller: &mut Caller<'_, Guest>,
    name_at: i32,
    name_len: i32,
    at: i32,
    len: i32,
) -> Result<i32, wasmtime::Error> {
    let name = text(caller, name_at, name_len)?;
    let bytes = super::memory::bytes(caller, at, len)?;
    let Some(path) = inside(caller.data().data_dir(), &name) else {
        return Ok(-1);
    };
    match write_atomically(&path, &bytes) {
        Ok(()) => Ok(0),
        Err(error) => {
            tracing::warn!(plugin = caller.data().plugin(), path = %path.display(), %error, "A plugin's file could not be written");
            Ok(-1)
        }
    }
}

/// Replaces `path` with `bytes` in one step, or leaves it as it was.
///
/// The bytes are written to a temporary file beside the target and then renamed
/// over it; a rename within one directory is atomic, so a plugin stopped partway
/// through cannot leave a half-written file under the real name. The temporary
/// name carries a counter, because two instances of the same plugin (a front and
/// a background one, when #99 arrives) share this directory and their temporary
/// files must not be each other's.
fn write_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let directory = path.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::NotFound, "the path has no directory")
    })?;
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let temporary = directory.join(format!(
        ".{name}.{}.{}.tmp",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    // Written through a handle that is closed before the rename: the bytes are
    // flushed by the time the name changes, so a reader that sees the new name
    // sees all of the bytes.
    let written = (|| {
        let mut file = std::fs::File::create(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()
    })();
    if let Err(error) = written {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }
    std::fs::rename(&temporary, path).inspect_err(|_| {
        // The target is untouched — that is what the rename bought — so what is
        // left behind is a temporary file, and this is the one place that knows
        // to take it away.
        let _ = std::fs::remove_file(&temporary);
    })
}

/// How many temporary files this process has made, for the names above.
static NEXT: AtomicU64 = AtomicU64::new(0);

/// The file a name refers to, if it is one this plugin may touch.
///
/// One component and one only: a plugin's directory holds files, and a name
/// with a separator in it, or `..`, or a root, is not a file in that directory.
/// Returning `None` rather than an error is the shape of the capability — there
/// is no such file, and there is nothing for a plugin to learn from being told
/// which part of the name was refused.
fn inside(directory: &Path, name: &str) -> Option<PathBuf> {
    let mut parts = Path::new(name).components();
    match (parts.next(), parts.next()) {
        (Some(Component::Normal(_)), None) => Some(directory.join(name)),
        _ => None,
    }
}
