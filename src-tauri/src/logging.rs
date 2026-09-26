use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::Manager;
use tracing_subscriber::fmt::writer::MakeWriter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer};

/// The file diagnostics go to, beside the library's database.
const LOG_FILE_NAME: &str = "enjoy.log";

/// A log larger than this is rotated aside. One file and one predecessor, so
/// the most a run can leave behind is twice this. Line count is not a safety
/// property here: a scan that fails on every file can write a great deal in a
/// short time.
const MAX_LOG_BYTES: u64 = 4 * 1024 * 1024;

/// Sends diagnostics to stdout and to a file in the application data folder.
///
/// The file is the point of this. Every failure the user is shown carries an
/// error id and nothing else, and what that id stands for sits on a `tracing`
/// line — but a Windows release build has no console, so stdout alone means the
/// reason is written nowhere anyone can read it. The id is only worth printing
/// if somewhere holds what it stands for.
///
/// Failing to open the file is not a reason to refuse to start: stdout is what
/// the build had before, so that is what it falls back to.
pub fn init(app: &tauri::AppHandle) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into());
    let console = tracing_subscriber::fmt::layer().with_filter(filter.clone());
    let registry = tracing_subscriber::registry().with(console);
    let path = app
        .path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(LOG_FILE_NAME));
    match path.and_then(|path| open(&path).map(|file| (file, path)).ok()) {
        Some((file, path)) => {
            // No colour codes: the file is read with an editor or a pager, and
            // the escape sequences would be read as part of the message.
            let file = tracing_subscriber::fmt::layer()
                .with_ansi(false)
                .with_writer(file)
                .with_filter(filter);
            let _ = registry.with(file).try_init();
            tracing::info!(path = %path.display(), "Diagnostics are also written to this file");
        }
        None => {
            let _ = registry.try_init();
            tracing::warn!("No log file could be opened; diagnostics go to stdout only");
        }
    }
}

fn open(path: &Path) -> io::Result<LogFile> {
    let directory = path
        .parent()
        .ok_or_else(|| io::Error::other("no directory"))?;
    fs::create_dir_all(directory)?;
    let (file, written) = append(path)?;
    Ok(LogFile {
        path: path.to_path_buf(),
        state: Mutex::new(Open {
            file: Some(file),
            written,
        }),
    })
}

/// The one file every record is appended to, rotated aside when it grows too
/// large. Writes are synchronous: the volume here is a handful of lines per
/// user action, and a record that has not reached the disk is not evidence.
struct LogFile {
    path: PathBuf,
    state: Mutex<Open>,
}

struct Open {
    /// `None` only between a rotation giving up its old file and opening the
    /// new one — see [`LogFile::rotate`].
    file: Option<File>,
    written: u64,
}

fn append(path: &Path) -> io::Result<(File, u64)> {
    let file = OpenOptions::new().create(true).append(true).open(path)?;
    let written = file.metadata().map(|meta| meta.len()).unwrap_or_default();
    Ok((file, written))
}

impl LogFile {
    /// Moves the current file aside and starts an empty one.
    ///
    /// The predecessor is replaced rather than numbered: months of logs beside
    /// the library are not worth the disk, and the run being reported on is the
    /// last one. The order is Windows': it renames neither onto a file that
    /// exists nor over one that is open, so the target goes first and this
    /// handle is closed before the move. Whatever happens, the file to write to
    /// afterwards is opened before returning, so a failed rotation costs the
    /// rotation and not the logging.
    fn rotate(&self, open: &mut Open) {
        let previous = self.path.with_extension("log.1");
        drop(open.file.take());
        let _ = fs::remove_file(&previous);
        let _ = fs::rename(&self.path, &previous);
        if let Ok((file, written)) = append(&self.path) {
            open.written = written;
            open.file = Some(file);
        }
    }
}

impl<'a> MakeWriter<'a> for LogFile {
    type Writer = Guard<'a>;

    fn make_writer(&'a self) -> Self::Writer {
        Guard { log: self }
    }
}

struct Guard<'a> {
    log: &'a LogFile,
}

impl Write for Guard<'_> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        // A poisoned lock still guards a usable file: logging must not be the
        // thing that turns one thread's panic into everyone's.
        let mut open = self
            .log
            .state
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let Some(file) = open.file.as_mut() else {
            // Only reachable if a rotation could not open its replacement, in
            // which case there is nowhere to put this line. Reporting success
            // keeps the writer from being retried on every record.
            return Ok(buf.len());
        };
        let written = file.write(buf)?;
        open.written += written as u64;
        if open.written > MAX_LOG_BYTES {
            self.log.rotate(&mut open);
        }
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        let mut open = self
            .log
            .state
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        match open.file.as_mut() {
            Some(file) => file.flush(),
            None => Ok(()),
        }
    }
}
