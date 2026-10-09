//! Real files in a temporary directory, for the tests of both halves of the
//! service: the filesystem's own contract and the protocol on top of it.
//!
//! Nothing here stands in for a file system, for the same reason the library's
//! tests run against a real database: what is being checked is a rule about
//! names and bytes, and a stand-in would be a second implementation of the rule
//! rather than a check on the first.

use std::path::Path;

use crate::repository::fixture::Fixture;

/// Writes the named files under a temporary directory, and answers with the list
/// in the order it was given — which is the order the numbers are handed out in.
///
/// Each file holds its own name, so a test that reads one back through a
/// 虚拟文件名 can tell which real file answered: a listing says what a file is
/// called, and only the bytes say which file it is.
pub(crate) fn listing(names: &[&str]) -> (Fixture, Vec<String>) {
    let fixture = Fixture::new();
    let paths = names
        .iter()
        .map(|name| {
            let path = fixture.0.join(name);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, name.as_bytes()).unwrap();
            path.to_string_lossy().into_owned()
        })
        .collect();
    (fixture, paths)
}

/// A name as a URL path carries it.
///
/// A URL path is printable ASCII by definition, so a name outside that alphabet
/// has to arrive percent-encoded. Encoding it here is therefore not a way round
/// the parser — it is the journey a real request takes, and the decoding on the
/// other side is part of what the tests drive.
pub(crate) fn encoded(name: &str) -> String {
    name.bytes()
        .map(|byte| match byte {
            b'/' | b'.' | b'-' | b'0'..=b'9' | b'A'..=b'Z' | b'a'..=b'z' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

/// The file a name in [`listing`] stands for.
pub(crate) fn path_of(fixture: &Fixture, name: &str) -> std::path::PathBuf {
    fixture.0.join(Path::new(name))
}
