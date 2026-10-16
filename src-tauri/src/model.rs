use serde::{Deserialize, Serialize};
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
    /// The picture a plugin gave this record, if one did: the path of a file
    /// under `$APPDATA/covers/`.
    ///
    /// It is not a column of `videos` and is never written to one. The cover is
    /// a plugin's answer stored in `video_fields` like every other field
    /// ([`COVER_FIELD`]), and this is that row read back out by the listing —
    /// one fact, one place it is kept. Last in the struct because it is the
    /// last column the listing's own read selects, which is the only read that
    /// asks for it.
    pub cover_path: Option<String>,
}

/// The one field name the kernel knows.
///
/// A plugin's fields are the plugin's own vocabulary and the kernel draws them
/// without understanding them (`VideoField::key` says so). This one is the
/// exception, and it is a deliberate one: `cover` is not one plugin's word for
/// something, it is *the picture of this video*, which the interface draws in
/// the same place it draws a thumbnail. So the kernel knows this name — it is
/// what the listing is joined on and what the download in
/// [`crate::plugins::cover`] is keyed by — and knows no other.
///
/// It is not a plugin's name, so it does not break the rule that the kernel
/// never names a plugin (ADR 0043 §2): whichever plugin answers with it, and
/// whatever else that plugin calls its own fields, the kernel is being told the
/// same thing.
///
/// The value is a path, and the image behind it is the kernel's to fetch and
/// write: a plugin can reach its own data directory and nothing else, so a
/// plugin that answered with an address could not put the picture anywhere the
/// window can draw it. `plugins::cover` is where the address becomes a file.
pub(crate) const COVER_FIELD: &str = "cover";

/// One named thing a plugin has written about a record.
///
/// `source_plugin` is the id of the plugin that wrote the value, kept as a bare
/// string: plugins live on disk and this library does not, so nothing ties the
/// two together and a field outlives the plugin that wrote it (ADR 0045 §3).
/// That is the whole reason the source is stored at all — the interface has to
/// say who a value came from, including after the plugin has been uninstalled
/// (User Story 10).
#[derive(Debug, Clone, Serialize)]
pub struct VideoField {
    pub key: String,
    pub value: String,
    pub source_plugin: String,
}

/// One thing the user filled in for a plugin.
///
/// The plugin is not a field of this: a setting is always read and written for
/// one named plugin, so the name is the call's argument rather than a column of
/// every row it answers with. There is no space either, and that is the decision
/// rather than an omission — a setting says how the plugin works, not what is in
/// a space, so the same answers are in force in every one (baseline §14.7).
///
/// It is not the catalog's `SettingValue`, and deliberately: that shape is
/// generated, and a generated file is not where a decision about what the
/// library stores belongs. The two are the same two facts and the conversion is
/// written out at the one place they meet.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginSetting {
    pub key: String,
    pub value: String,
}

/// One page of a space's records, and how many the same question holds.
///
/// The two travel together because the interface draws them together: the
/// records fill the page, and the count is what says how many pages there are.
/// A count read as a second question would be a second answer to it.
#[derive(Debug, Serialize)]
pub struct VideoPage {
    pub items: Vec<VideoFile>,
    pub total: i64,
}

/// What the interface asks the library for: which of a space's records, in what
/// order, and which page of them.
///
/// Every part of this was the interface's own work until a listing became a
/// page. It cannot be any more: a search applied to the page in hand answers
/// about that page rather than about the library, and the number of pages it
/// would report is then wrong too. So the whole question travels, and the answer
/// is a page (ADR 0016).
///
/// The three that name a condition rather than a value — [`VideoFilter`],
/// [`VideoSort`] and [`SortDirection`] — are enums because the vocabulary is
/// closed: a sort this backend does not know is not an order to fall back from
/// but a request that cannot be answered, and it is refused where it arrives.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoQuery {
    pub space_id: i64,
    /// Matched against the file name — what the user reads on the card — and not
    /// against the path, which would also match the directory names.
    pub search: Option<String>,
    /// One directory, by the path recorded for it. Exact, not a prefix: the
    /// folder a record is filed under is a fact about that record, and matching
    /// its ancestors would make one row answer to several entries at once.
    pub folder: Option<String>,
    /// The 页面固有条件: what makes a page the 收藏页, the 共享页 or the 最近播放页
    /// rather than the library.
    pub only: Option<VideoFilter>,
    pub sort: Option<VideoSort>,
    /// Absent means the sort's own default, which is the direction the page is
    /// usually read in (see [`VideoSort::direction`]).
    pub direction: Option<SortDirection>,
    /// Where the page starts, counted in records the query matches. A negative
    /// offset is read as the first page.
    pub offset: i64,
    /// How many records the page holds. Zero is a page with nothing on it, and a
    /// negative limit is read the same way rather than as the whole library.
    pub limit: i64,
}

/// The condition a listing page is about.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VideoFilter {
    Favorite,
    Shared,
    /// 播放历史: a record that has been played at least once.
    Played,
}

/// The orders a listing can be read in.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VideoSort {
    /// 最近添加.
    Added,
    /// 最近播放: records that have never been played come after the ones that
    /// have, rather than being left out — the 最近播放页 asks for them by filter,
    /// and the library shows everything.
    Played,
    /// 文件名, A to Z.
    Name,
    /// 文件体积.
    Size,
}

/// Which way an order is read. 最近打开（降序）and 打开时间（升序）are one field's
/// two directions rather than two orderings, so there is one name per field and
/// this beside it (ADR 0016).
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SortDirection {
    Asc,
    Desc,
}

impl VideoSort {
    /// The direction this order is read in when the query names none: the one
    /// the page is usually read in. A library is looked at newest first and a
    /// large file before a small one, while a name is read from A.
    pub fn direction(self) -> SortDirection {
        match self {
            Self::Name => SortDirection::Asc,
            Self::Added | Self::Played | Self::Size => SortDirection::Desc,
        }
    }

    /// The column this order is read by. Written here rather than sent as a
    /// string: a column name that arrived from outside would be a column the
    /// schema has never heard of.
    pub fn column(self) -> &'static str {
        match self {
            Self::Added => "created_at",
            Self::Played => "last_played_at",
            Self::Name => "file_name",
            Self::Size => "file_size",
        }
    }
}

impl SortDirection {
    pub fn sql(self) -> &'static str {
        match self {
            Self::Asc => "ASC",
            Self::Desc => "DESC",
        }
    }
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
