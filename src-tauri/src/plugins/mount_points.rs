//! The mount point contract catalog, generated from
//! `shared/plugins/mount-points.json`. Do not edit by hand: change the
//! catalog and run `npm run generate:plugins`.
//!
//! Why it exists: docs/adr/0045-挂载点分两半且是封闭集.md section 6.

use serde::{Deserialize, Serialize};

/// What a plugin contributes at a mount point.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum MountCategory {
    Interface,
    Data,
    Flow,
    Action,
}

/// What a plugin adds at a mount point: `List` keeps every contribution,
/// `Chain` asks in plugin order and merges the answers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum MountKind {
    List,
    Chain,
}

/// Which half of a plugin owns a mount point.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum MountSide {
    Interface,
    Body,
}

/// What a contribution is attached to, and therefore which space it follows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum MountScope {
    App,
    Video,
    Plugin,
    Scan,
}

/// How the answers of several plugins become one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum MergeRule {
    Overlay,
    FirstNonEmpty,
}

/// The video a call is about, and everything a plugin is told about it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct VideoRef {
    pub id: i64,
    pub path: String,
}

/// One named field's value. The kernel adds the source plugin when it writes; an identity a plugin claims about itself does not count.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct FieldValue {
    pub key: String,
    pub value: String,
}

/// One setting the kernel draws for a plugin, out of what the plugin says it needs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SettingField {
    pub key: String,
    pub kind: SettingFieldKind,
    pub label: String,
    pub required: bool,
}

/// The four kinds of setting field the kernel draws.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SettingFieldKind {
    Text,
    Textarea,
    Toggle,
    Directory,
}

/// What the kernel hands the contributions at `app.page`: nothing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct AppPageParams {}

/// What the contributions at `app.page` hand back: nothing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct AppPageResult {}

/// What the kernel hands the contributions at `video.panel`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct VideoPanelParams {
    pub video: VideoRef,
}

/// What the contributions at `video.panel` hand back: nothing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct VideoPanelResult {}

/// What the kernel hands the contributions at `video.fields`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct VideoFieldsParams {
    pub video: VideoRef,
}

/// What the contributions at `video.fields` hand back.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct VideoFieldsResult {
    pub fields: Vec<FieldValue>,
}

/// What the kernel hands the contributions at `plugin.settings`: nothing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PluginSettingsParams {}

/// What the contributions at `plugin.settings` hand back.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PluginSettingsResult {
    pub fields: Vec<SettingField>,
}

/// What the kernel hands the contributions at `scan.completed`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ScanCompletedParams {
    pub videos: Vec<VideoRef>,
}

/// What the contributions at `scan.completed` hand back: nothing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ScanCompletedResult {}

/// What the kernel hands the contributions at `video.actions`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct VideoActionsParams {
    pub video: VideoRef,
}

/// What the contributions at `video.actions` hand back: nothing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct VideoActionsResult {}

/// One entry of the catalog.
#[derive(Debug, Clone, Copy)]
pub(crate) struct MountPoint {
    pub key: &'static str,
    pub category: MountCategory,
    pub kind: MountKind,
    pub side: MountSide,
    pub scope: MountScope,
    pub merge: MergeRule,
}

/// The six mount points, in catalog order.
pub(crate) const MOUNT_POINTS: [MountPoint; 6] = [
    MountPoint {
        key: "app.page",
        category: MountCategory::Interface,
        kind: MountKind::List,
        side: MountSide::Interface,
        scope: MountScope::App,
        merge: MergeRule::Overlay,
    },
    MountPoint {
        key: "video.panel",
        category: MountCategory::Interface,
        kind: MountKind::List,
        side: MountSide::Interface,
        scope: MountScope::Video,
        merge: MergeRule::Overlay,
    },
    MountPoint {
        key: "video.fields",
        category: MountCategory::Data,
        kind: MountKind::Chain,
        side: MountSide::Body,
        scope: MountScope::Video,
        merge: MergeRule::FirstNonEmpty,
    },
    MountPoint {
        key: "plugin.settings",
        category: MountCategory::Data,
        kind: MountKind::List,
        side: MountSide::Body,
        scope: MountScope::Plugin,
        merge: MergeRule::Overlay,
    },
    MountPoint {
        key: "scan.completed",
        category: MountCategory::Flow,
        kind: MountKind::List,
        side: MountSide::Body,
        scope: MountScope::Scan,
        merge: MergeRule::Overlay,
    },
    MountPoint {
        key: "video.actions",
        category: MountCategory::Action,
        kind: MountKind::List,
        side: MountSide::Body,
        scope: MountScope::Video,
        merge: MergeRule::Overlay,
    },
];
