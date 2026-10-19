//! Reading a plugin out of wherever the user pointed, and copying it in.
//!
//! Installing starts from a folder or an archive the user picked — v1 has no
//! network install and no marketplace (spec #82, 「不做网络安装」) — and this
//! module is the whole of what it takes to get from that to a directory the
//! kernel can read. It is separate from [`super::store`] because the two answer
//! different questions: this one is about *somebody else's* directory, which
//! may be a zip, may hold the plugin one level down, and may be read-only;
//! `store` is about ours, which is always `$APPDATA/plugins/<id>/`.
//!
//! Two things are deliberately not here:
//!
//! - **Nothing is copied until the user has seen the preview.** [`read`]
//!   unpacks an archive into a directory of ours and hands back where the
//!   plugin's files are; `Store::preview` reads the manifest out of that and
//!   answers. A source that turns out to be unusable is refused before anything
//!   of the user's library is touched.
//! - **An archive is unpacked into a new, empty directory of its own**, under
//!   the system's temporary directory, which goes when the read is done with.
//!   An archive is a file somebody else wrote, and nothing here runs from
//!   inside it or reads it where it lies.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::error::AppError;

use super::manifest::{self, Manifest};

static NEXT: AtomicU64 = AtomicU64::new(0);

/// A plugin's files, read out of whatever the user pointed at.
pub(crate) struct Source {
    directory: PathBuf,
    pub(crate) manifest: Manifest,
    /// The directory of ours the archive was unpacked into, when there was one.
    /// Held rather than dropped because it is what the files are in.
    _unpacked: Option<Unpacked>,
}

impl Source {
    pub(crate) fn directory(&self) -> &Path {
        &self.directory
    }
}

/// Reads a source, without installing anything.
///
/// The plugin is the source directory itself when that holds a manifest, and
/// otherwise the first of its subdirectories that does, by name. "First by
/// name" rather than a refusal when there is more than one: what the user is
/// about to be shown is which plugin, by name, from where — the preview exists
/// so that this can be a decision rather than a guess, and a preview that names
/// the plugin is a better answer than an error that does not.
pub(crate) fn read(source: &Path) -> Result<Source, AppError> {
    let (directory, unpacked) = if source.is_dir() {
        (source.to_path_buf(), None)
    } else if source.is_file() {
        let unpacked = Unpacked::open(source)?;
        (unpacked.path().to_path_buf(), Some(unpacked))
    } else {
        return Err(invalid_source(source));
    };
    let plugin = plugin_in(&directory).ok_or_else(|| invalid_source(source))?;
    // The directory here is the user's, or a temporary one of ours, and neither
    // is where the plugin will end up — so the one check that is about the
    // directory's name is left to `Store::install`, which knows the id and can
    // ask whether that name is free.
    let manifest = manifest::read_before_install(&plugin).map_err(|problem| {
        let name = plugin
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        refused(problem.named(&name))
    })?;
    Ok(Source {
        directory: plugin,
        manifest,
        _unpacked: unpacked,
    })
}

/// Copies a plugin's files into place.
///
/// A plain recursive copy, because there is nothing here to be clever about:
/// the files are the plugin's own and are going to a directory of ours. What it
/// will not do is follow anything that is neither a file nor a directory — a
/// symlink in the source is refused rather than resolved, so what lands in the
/// plugins directory is what was in the source and not whatever it pointed at.
pub(crate) fn copy(from: &Path, to: &Path) -> Result<(), AppError> {
    fs::create_dir_all(to).map_err(|error| failed(to, error))?;
    let entries = fs::read_dir(from).map_err(|error| failed(from, error))?;
    for entry in entries {
        let entry = entry.map_err(|error| failed(from, error))?;
        let path = entry.path();
        let destination = to.join(entry.file_name());
        let kind = entry.file_type().map_err(|error| failed(&path, error))?;
        if kind.is_dir() {
            copy(&path, &destination)?;
        } else if kind.is_file() {
            fs::copy(&path, &destination).map_err(|error| failed(&destination, error))?;
        } else {
            return Err(failed(&path, "not a file or a directory"));
        }
    }
    Ok(())
}

/// The plugin in this directory: itself, or the first subdirectory that is one.
fn plugin_in(root: &Path) -> Option<PathBuf> {
    if root.join(manifest::FILE).is_file() {
        return Some(root.to_path_buf());
    }
    let mut candidates: Vec<PathBuf> = fs::read_dir(root)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir() && path.join(manifest::FILE).is_file())
        .collect();
    candidates.sort();
    candidates.into_iter().next()
}

/// A manifest that did not validate, in the kernel's error protocol.
///
/// The `error_id` is made here rather than by `AppError::new`'s usual path,
/// because a refused manifest is not a failure of an operation: it is the
/// answer to one, and the row that carries it says so.
fn refused(problem: manifest::Problem) -> AppError {
    let mut error = AppError::new(problem.code, "plugin manifest refused");
    error.params = problem
        .params
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect();
    error
}

fn invalid_source(source: &Path) -> AppError {
    AppError::new(
        "plugin.install.invalid_source",
        format!("{} is not a plugin folder or archive", source.display()),
    )
    .with_param("source", source.to_string_lossy())
}

fn failed(path: &Path, source: impl std::fmt::Display) -> AppError {
    AppError::new("plugin.install.failed", source).with_param("path", path.to_string_lossy())
}

/// An archive unpacked into a directory of ours, which goes when this does.
struct Unpacked(PathBuf);

/// A directory of ours that is new and empty, under this name if it is free.
///
/// `fs::create_dir` and not `create_dir_all`, and that is the whole point: the
/// creation is what decides whether the name was free, so a name that is taken
/// is left alone rather than unpacked into. The numbers after it are the same
/// name asked again.
fn free_directory(wanted: &str) -> Result<PathBuf, AppError> {
    let mut candidate = std::env::temp_dir().join(wanted);
    let mut attempt = 1;
    loop {
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                candidate = std::env::temp_dir().join(format!("{wanted}-{attempt}"));
                attempt += 1;
            }
            Err(error) => return Err(failed(&candidate, error)),
        }
    }
}

impl Unpacked {
    fn open(archive: &Path) -> Result<Self, AppError> {
        if !is_archive(archive) {
            return Err(invalid_source(archive));
        }
        let wanted = format!(
            "enjoy-plugin-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        );
        // A directory that is new and empty: what is unpacked into it is
        // whatever the archive says, and nothing of ours is in there to be
        // overwritten. That is why the name is not simply taken: `NEXT` starts
        // at 0 in every run, so a directory left behind by a process that was
        // killed meets a recycled pid and the name comes up again — and
        // unpacking into that one would put this archive's files among the
        // previous plugin's, with the preview then reading *that* one's
        // manifest, since a plugin's own directory is what is read from its
        // root. A taken name is not reused; the next number is.
        let directory = free_directory(&wanted)?;
        let unpacked = Self(directory);
        let file = fs::File::open(archive).map_err(|error| failed(archive, error))?;
        let mut zip = zip::ZipArchive::new(file).map_err(|error| failed(archive, error))?;
        // `extract` refuses an entry whose path climbs out of the destination
        // and will not follow a symlink pointing outside it, so an archive
        // cannot write anywhere but here.
        zip.extract(unpacked.path())
            .map_err(|error| failed(archive, error))?;
        Ok(unpacked)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Unpacked {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// Whether this file is an archive this application can read.
///
/// One format, by extension. It is the one every platform's own file manager
/// makes without being asked, and the one a plugin author will reach for; a
/// second format would be a second unpacker, and the refusal names what is
/// accepted rather than leaving the user to guess.
fn is_archive(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A name that is taken is left alone, and the next one is used.
    ///
    /// This is the case the comment in `Unpacked::open` is about: `NEXT` starts
    /// at 0 in every run, so a directory left behind by a process that was
    /// killed meets a recycled pid and the same name comes up again.
    #[test]
    fn a_taken_name_is_not_unpacked_into() {
        let taken = free_directory("enjoy-plugin-test-taken").unwrap();
        fs::write(taken.join("from-the-last-run.js"), "somebody else's code").unwrap();

        let next = free_directory("enjoy-plugin-test-taken").unwrap();

        assert_ne!(next, taken);
        assert!(
            !next.join("from-the-last-run.js").exists(),
            "what is unpacked into the new directory is this archive's files and nothing else"
        );
        assert!(
            taken.join("from-the-last-run.js").exists(),
            "the directory that was already there is not written into"
        );

        fs::remove_dir_all(&taken).unwrap();
        fs::remove_dir_all(&next).unwrap();
    }
}
