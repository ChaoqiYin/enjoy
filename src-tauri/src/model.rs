use serde::Serialize;

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
    pub play_count: i64,
    pub last_played_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug)]
pub struct ScannedFile {
    pub path: String,
    pub file_name: String,
    pub folder_path: String,
    pub file_size: i64,
    pub modified_at: i64,
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
