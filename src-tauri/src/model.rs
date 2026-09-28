use serde::Serialize;
use std::time::UNIX_EPOCH;

#[derive(Debug, Serialize)]
pub struct VideoFile {
    pub id: i64,
    pub path: String,
    pub file_name: String,
    pub folder_path: String,
    pub file_size: i64,
    pub modified_at: i64,
    #[serde(skip)]
    pub media_complete: bool,
    pub duration_ms: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub codec: Option<String>,
    pub thumbnail_path: Option<String>,
    pub favorite: bool,
    /// 共享清单: whether this record is one of the videos the space offers over
    /// the share service. Beside `favorite` because it is the same kind of
    /// thing — a mark the user puts on a record the space already holds.
    pub shared: bool,
    pub play_count: i64,
    pub last_played_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// One self-contained library: its own directories, records, favorites and play
/// history. Spaces share no records at all — the same path is a different video
/// in each of them (ADR 0011).
#[derive(Debug, Serialize)]
pub struct Space {
    pub id: i64,
    pub name: String,
}

#[derive(Clone, Debug)]
pub struct ScannedFile {
    pub path: String,
    pub file_name: String,
    pub folder_path: String,
    pub file_size: i64,
    pub modified_at: i64,
}

/// What one configured directory turned out to be this time.
///
/// One answer, and the records under the directory live or die by it: 过期视频记录
/// is decided here and nowhere else. A copy of this verdict travels to the
/// repository, which does what it says rather than working it out again from
/// what it is handed.
///
/// The two ways of knowing nothing lead to the same place — the records stand —
/// but are kept apart because only one of them is a fact about the scan
/// universe: a directory that is not a directory was never one that could not be
/// listed, which is what 不可访问目录 counts.
#[derive(Clone, Debug)]
pub enum Found {
    /// Read: the videos under it, and the paths that failed this run while
    /// still being there. Every other record under this directory is gone.
    Read {
        files: Vec<ScannedFile>,
        unreadable: Vec<String>,
    },
    /// Not there any more, so everything it held went with it.
    Gone,
    /// There, but this run could not read it: 不可访问目录.
    Unreachable,
    /// There, but not a directory at all.
    NotADirectory,
}

impl Found {
    /// Whether this is an 不可访问目录.
    ///
    /// The counter the interface shows is this question and nothing else: the
    /// answer is a fact about the scan universe — a configured video directory
    /// that is still on disk and could not be listed — and a path that is not a
    /// directory is not one of those.
    pub fn is_unreachable(&self) -> bool {
        matches!(self, Self::Unreachable)
    }
}

/// A file record's size and modification time.
///
/// The pair carries both meanings the library needs from a file:
///
/// - it *is* the identity the change verdict is read from: a scan compares the
///   stored pair with the pair on disk, and a difference in either field means
///   the file changed, so the derived media information is invalidated and
///   recomputed (ADR 0004);
/// - it is the optimistic-lock token a write is expected to still match, used
///   to detect a concurrent scan.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileStamp {
    pub file_size: i64,
    pub modified_at: i64,
}

impl FileStamp {
    /// Reads the identity off a file's metadata. The file is never opened.
    ///
    /// One implementation, because there were two and they had already drifted:
    /// the modification time arrives as a `u128` of milliseconds, and one copy
    /// clamped it to `i64::MAX` while the other cast it. A real file cannot reach
    /// the difference — it takes a timestamp some 292 million years out — but
    /// this pair *is* the identity, and the guard every media write is checked
    /// against (ADR 0004), so a rule read in two places is a rule with two
    /// meanings waiting to be meant.
    pub fn from_metadata(metadata: &std::fs::Metadata) -> std::io::Result<Self> {
        let modified = metadata
            .modified()?
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        Ok(Self {
            file_size: i64::try_from(metadata.len()).unwrap_or(i64::MAX),
            modified_at: i64::try_from(modified).unwrap_or(i64::MAX),
        })
    }
}
