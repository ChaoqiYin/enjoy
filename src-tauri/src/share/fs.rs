//! The virtual filesystem the 共享服务 presents to a client.
//!
//! The library is a set of records, each of them a real file somewhere under a
//! directory the user chose. What a WebDAV client sees is one flat collection
//! with no subdirectories at all, so the filesystem here is not a view of a
//! directory: it is a map from 虚拟文件名 to a real path, and every method is a
//! lookup in that map.
//!
//! That is also the second line of defence. A client's path can only ever name
//! something the map holds, so traversal — `..`, an absolute path, a symlink
//! pointing out of the library — has nowhere to arrive: a name that is not in
//! the map is not found, whatever it was spelled out of. The first line is that
//! the names in the map are the ones this application wrote, not the ones a
//! client sent.
//!
//! The map is built once, when the service starts, from the space's 共享清单. It
//! is a snapshot: the list changing, or a file changing on disk, does not reach a
//! service that is already running, which is why changing what is on the list
//! means restarting the service.

use std::collections::BTreeMap;
use std::fs::File;
use std::future;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use bytes::Bytes;
use dav_server::davpath::DavPath;
use dav_server::fs::{
    DavDirEntry, DavFile, DavFileSystem, DavMetaData, FsError, FsFuture, FsResult, FsStream,
    OpenOptions, ReadDirMeta,
};
use futures_util::{stream, FutureExt};

/// What the service serves: every video on one space's 共享清单, under the name
/// the client will ask for it by.
#[derive(Clone)]
pub(crate) struct ShareFs {
    /// 虚拟文件名 → the real file it stands for, in name order.
    files: BTreeMap<String, Entry>,
    /// When this snapshot was taken, which is the root's modification time.
    built: SystemTime,
    /// Entries of the list that could not be offered because the file is not on
    /// disk any more. Reported to the interface so that a user can be told their
    /// television will show fewer videos than they picked.
    missing: usize,
}

/// One real file, and what was true of it when the snapshot was taken.
#[derive(Clone)]
struct Entry {
    path: PathBuf,
    size: u64,
    modified: SystemTime,
}

impl ShareFs {
    /// Reads one space's 共享清单 into the shape the service serves.
    ///
    /// `paths` is the list in path order, and it is the order the numbers are
    /// handed out in: two files that want the same name are told apart by
    /// whichever comes first here. Ordering by the list itself rather than by
    /// when each video was added is what keeps the names still — inserting a
    /// video in the middle of a list would otherwise renumber everything after
    /// it, and the television would show a different set of names for no reason
    /// the user could see.
    ///
    /// A path whose file is not on disk is left out, and counted.
    pub(crate) fn build(paths: &[String]) -> Self {
        let mut files: BTreeMap<String, Entry> = BTreeMap::new();
        let mut missing = 0;
        for path in paths {
            let Ok(metadata) = std::fs::metadata(path) else {
                missing += 1;
                continue;
            };
            if !metadata.is_file() {
                missing += 1;
                continue;
            }
            // The name a client is shown is what is on disk. It is not cleaned
            // up, which is a blind spot the domain glossary records: a name
            // holding a character Windows will not accept in a path cannot be
            // opened from a Windows client, and the answer is that almost no
            // video is called that.
            let real = Path::new(path)
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default();
            let name = free_name(&files, &real);
            files.insert(
                name,
                Entry {
                    path: PathBuf::from(path),
                    size: metadata.len(),
                    modified: metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH),
                },
            );
        }
        Self {
            files,
            built: SystemTime::now(),
            missing,
        }
    }

    /// How many videos the user picked that this service cannot offer.
    pub(crate) fn missing(&self) -> usize {
        self.missing
    }

    /// The entry a request names, or `None` when it names nothing this
    /// filesystem holds.
    ///
    /// The whole of the lookup, and the whole of the safety: a request is turned
    /// into a name only when it is one name at the root — anything with a
    /// separator in it is not one of ours, whatever it was assembled from.
    fn entry(&self, path: &DavPath) -> Option<&Entry> {
        self.files.get(name_of(path)?)
    }
}

/// The 虚拟文件名 one more file goes by.
///
/// The name on disk if it is free, and otherwise the same name with a number
/// before its extension — `开场.mp4`, then `开场（1）.mp4`. The first of a set
/// keeps the plain name, so a library with no collisions is shown exactly the
/// names the user gave their files.
///
/// Numbering before the extension is what keeps a client from treating two files
/// as two formats of one thing, and full-width parentheses are what keep the
/// number off a name that could otherwise be a real one. A file genuinely called
/// `某名（1）` takes part in this like any other: it occupies its own name, and
/// the next one to want it goes on to `（2）`.
fn free_name(files: &BTreeMap<String, Entry>, real: &str) -> String {
    if !files.contains_key(real) {
        return real.to_string();
    }
    let (stem, extension) = split_extension(real);
    for number in 1u32.. {
        let candidate = format!("{stem}（{number}）{extension}");
        if !files.contains_key(&candidate) {
            return candidate;
        }
    }
    unreachable!("a file system with a finite number of names always has a free one")
}

/// A name split before its last dot, and the dot with what follows it.
///
/// A name that is all extension — `.gitignore` — is not split: a leading dot
/// starts a name rather than ending one, which is the rule every file system
/// this application reads already follows.
fn split_extension(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(at) if at > 0 => (&name[..at], &name[at..]),
        _ => (name, ""),
    }
}

/// The name a request asks for, or `None` when it is not one name at the root.
///
/// Written against the path's bytes rather than against a `PathBuf`, because
/// this is the one place a client's input becomes one of ours: a separator
/// anywhere after the first means the request is not about this collection, and
/// a path that is not valid UTF-8 cannot be a name this filesystem wrote.
fn name_of(path: &DavPath) -> Option<&str> {
    let name = path.as_bytes().strip_prefix(b"/")?;
    if name.is_empty() || name.contains(&b'/') {
        return None;
    }
    std::str::from_utf8(name).ok()
}

/// Whether a request is about the collection itself.
fn is_root(path: &DavPath) -> bool {
    matches!(path.as_bytes(), b"" | b"/")
}

/// What a failure of the disk underneath a request becomes.
///
/// `FsError` implements `From<&io::Error>` only with one of the crate's own
/// filesystems compiled in, and this application compiles neither, so the
/// mapping is written here rather than borrowed.
fn io_failure(error: std::io::Error) -> FsError {
    match error.kind() {
        std::io::ErrorKind::NotFound => FsError::NotFound,
        std::io::ErrorKind::PermissionDenied => FsError::Forbidden,
        _ => FsError::GeneralFailure,
    }
}

/// Runs one blocking call on a thread of its own, and hands the file back.
///
/// Reading a file blocks, and the runtime this service runs on is shared with
/// every other connection: a plain `read` inside a request would hold a worker
/// thread for as long as the disk takes, and the second device to press play
/// would wait behind the first. The file goes in and comes back because a call
/// that runs elsewhere has to own what it touches.
async fn off_thread<T, F>(held: &mut Option<File>, action: F) -> std::io::Result<T>
where
    F: FnOnce(&mut File) -> std::io::Result<T> + Send + 'static,
    T: Send + 'static,
{
    let mut file = held.take().expect("the file is there between calls");
    let (result, file) = tokio::task::spawn_blocking(move || {
        let result = action(&mut file);
        (result, file)
    })
    .await
    .expect("nothing cancels the thread while a read is in it");
    *held = Some(file);
    result
}

impl DavFileSystem for ShareFs {
    fn open<'a>(
        &'a self,
        path: &'a DavPath,
        options: OpenOptions,
    ) -> FsFuture<'a, Box<dyn DavFile>> {
        async move {
            // Read-only, in one place. Every method a client could change
            // something with arrives here first — a PUT opens a file for
            // writing — so refusing the write options is what makes the whole
            // service read-only, rather than a list of methods to remember.
            if options.write || options.append || options.truncate || options.create {
                return Err(FsError::Forbidden);
            }
            let entry = self.entry(path).ok_or(FsError::NotFound)?;
            let file = File::open(&entry.path).map_err(io_failure)?;
            Ok(Box::new(ShareFile {
                file: Some(file),
                size: entry.size,
                modified: entry.modified,
            }) as Box<dyn DavFile>)
        }
        .boxed()
    }

    fn read_dir<'a>(
        &'a self,
        path: &'a DavPath,
        _meta: ReadDirMeta,
    ) -> FsFuture<'a, FsStream<Box<dyn DavDirEntry>>> {
        async move {
            // One level, and only the one: the library's files are spread over
            // many directories, and the whole point of this filesystem is that
            // none of those directories is visible. A path below the root is not
            // an empty directory, it is not a directory at all.
            if !is_root(path) {
                return Err(FsError::NotFound);
            }
            let entries: Vec<FsResult<Box<dyn DavDirEntry>>> = self
                .files
                .iter()
                .map(|(name, entry)| {
                    Ok(Box::new(ShareEntry {
                        name: name.clone(),
                        size: entry.size,
                        modified: entry.modified,
                    }) as Box<dyn DavDirEntry>)
                })
                .collect();
            Ok(Box::pin(stream::iter(entries)) as FsStream<Box<dyn DavDirEntry>>)
        }
        .boxed()
    }

    fn metadata<'a>(&'a self, path: &'a DavPath) -> FsFuture<'a, Box<dyn DavMetaData>> {
        async move {
            if is_root(path) {
                return Ok(Box::new(Collection {
                    modified: self.built,
                }) as Box<dyn DavMetaData>);
            }
            match self.entry(path) {
                Some(entry) => Ok(Box::new(FileMetadata {
                    size: entry.size,
                    modified: entry.modified,
                }) as Box<dyn DavMetaData>),
                None => Err(FsError::NotFound),
            }
        }
        .boxed()
    }
}

/// A file opened for reading.
///
/// The writes are refused here as well as at the door, so that a file already
/// open cannot be written through: the service is read-only, and a `DavFile` is
/// the last place a client could ask otherwise.
#[derive(Debug)]
struct ShareFile {
    /// Taken out for the length of a blocking call and put back after it.
    file: Option<File>,
    size: u64,
    modified: SystemTime,
}

impl DavFile for ShareFile {
    fn metadata(&'_ mut self) -> FsFuture<'_, Box<dyn DavMetaData>> {
        let metadata = FileMetadata {
            size: self.size,
            modified: self.modified,
        };
        Box::pin(future::ready(
            Ok(Box::new(metadata) as Box<dyn DavMetaData>),
        ))
    }

    fn write_bytes(&'_ mut self, _buf: Bytes) -> FsFuture<'_, ()> {
        Box::pin(future::ready(Err(FsError::Forbidden)))
    }

    fn write_buf(&'_ mut self, _buf: Box<dyn bytes::Buf + Send>) -> FsFuture<'_, ()> {
        Box::pin(future::ready(Err(FsError::Forbidden)))
    }

    /// Reads up to `count` bytes from wherever the client left the file, which
    /// is what makes a range request a seek and a read rather than a copy: a
    /// player dragging its position bar asks for the middle of a film, and only
    /// that part is read off the disk.
    fn read_bytes(&'_ mut self, count: usize) -> FsFuture<'_, Bytes> {
        async move {
            let (mut buffer, read) = off_thread(&mut self.file, move |file| {
                let mut buffer = vec![0u8; count];
                let read = file.read(&mut buffer)?;
                Ok((buffer, read))
            })
            .await
            .map_err(io_failure)?;
            // Short at the end of the file, and empty past it: the end of a
            // file is not a failure, it is how the client is told to stop.
            buffer.truncate(read);
            Ok(Bytes::from(buffer))
        }
        .boxed()
    }

    fn seek(&'_ mut self, pos: SeekFrom) -> FsFuture<'_, u64> {
        async move {
            off_thread(&mut self.file, move |file| file.seek(pos))
                .await
                .map_err(io_failure)
        }
        .boxed()
    }

    fn flush(&'_ mut self) -> FsFuture<'_, ()> {
        Box::pin(future::ready(Ok(())))
    }
}

/// One name in the root's listing.
struct ShareEntry {
    name: String,
    size: u64,
    modified: SystemTime,
}

impl DavDirEntry for ShareEntry {
    fn name(&self) -> Vec<u8> {
        self.name.as_bytes().to_vec()
    }

    fn metadata(&'_ self) -> FsFuture<'_, Box<dyn DavMetaData>> {
        let metadata = FileMetadata {
            size: self.size,
            modified: self.modified,
        };
        Box::pin(future::ready(
            Ok(Box::new(metadata) as Box<dyn DavMetaData>),
        ))
    }
}

/// What a video looks like to the protocol.
#[derive(Clone, Debug)]
struct FileMetadata {
    size: u64,
    modified: SystemTime,
}

impl DavMetaData for FileMetadata {
    fn len(&self) -> u64 {
        self.size
    }

    fn modified(&self) -> FsResult<SystemTime> {
        Ok(self.modified)
    }

    fn is_dir(&self) -> bool {
        false
    }
}

/// The root, which is the only collection here.
#[derive(Clone, Debug)]
struct Collection {
    modified: SystemTime,
}

impl DavMetaData for Collection {
    /// Nothing, because a collection holds no bytes: its size is its listing's,
    /// and that is a number no client asks for.
    fn len(&self) -> u64 {
        0
    }

    /// When the list was read, and the same answer every time it is asked: a
    /// value that moved between two requests would look to a client like a
    /// collection that keeps changing under it.
    fn modified(&self) -> FsResult<SystemTime> {
        Ok(self.modified)
    }

    fn is_dir(&self) -> bool {
        true
    }
}
