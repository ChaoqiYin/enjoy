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
//! This file holds the shape and nothing else. What fills the map is the 共享清单,
//! and that arrives with the slice that reads it; until then the map is empty and
//! every request is answered as a name that is not there.

use std::future;

use dav_server::davpath::DavPath;
use dav_server::fs::{
    DavDirEntry, DavFile, DavFileSystem, DavMetaData, FsError, FsFuture, FsStream, OpenOptions,
    ReadDirMeta,
};

/// What the service serves.
#[derive(Clone, Default)]
pub(crate) struct ShareFs;

impl DavFileSystem for ShareFs {
    fn open<'a>(
        &'a self,
        _path: &'a DavPath,
        _options: OpenOptions,
    ) -> FsFuture<'a, Box<dyn DavFile>> {
        absent()
    }

    fn read_dir<'a>(
        &'a self,
        _path: &'a DavPath,
        _meta: ReadDirMeta,
    ) -> FsFuture<'a, FsStream<Box<dyn DavDirEntry>>> {
        absent()
    }

    fn metadata<'a>(&'a self, _path: &'a DavPath) -> FsFuture<'a, Box<dyn DavMetaData>> {
        absent()
    }
}

/// The one answer this filesystem gives today.
///
/// Written once rather than three times because it is one verdict: nothing is
/// here. The methods that will distinguish themselves — a directory that lists,
/// a file that opens — do so when there is something to distinguish.
fn absent<T: Send + 'static>() -> FsFuture<'static, T> {
    let result: Result<T, FsError> = Err(FsError::NotFound);
    Box::pin(future::ready(result))
}
