// Generated from shared/plugins/mount-points.json — do not edit by hand.
// Change the catalog and run `npm run generate:plugins`.
//
// Why the catalog exists: docs/adr/0045-挂载点分两半且是封闭集.md §6.

/** What a plugin contributes at a mount point. */
export type MountCategory = 'interface' | 'data' | 'flow' | 'action';

/** What a plugin adds at a mount point. */
export type MountKind = 'list' | 'chain';

/** Which half of a plugin owns a mount point. */
export type MountSide = 'interface' | 'body';

/** What a contribution is attached to, and so which space it follows. */
export type MountScope = 'app' | 'video' | 'plugin' | 'scan';

/** How the answers of several plugins become one. */
export type MergeRule = 'overlay' | 'first-non-empty';

/** The space a call is made in. A plugin's own data directory is global, but the data it is shown always belongs to one space. */
export interface SpaceRef {
  id: number;
}

/** The video a call is about, and everything a plugin is told about it. */
export interface VideoRef {
  id: number;
  path: string;
}

/** One named field's value, as a plugin hands it back. The kernel adds the source plugin when it writes; an identity a plugin claims about itself does not count, which is why this shape has no source. */
export interface FieldValue {
  key: string;
  value: string;
}

/** One named field's value as the kernel hands it to the next plugin in a chain: the same three facts, plus which plugin gave it. A separate shape from FieldValue on purpose — the source is the kernel's to say, and only on this side is there one. */
export interface SourcedFieldValue {
  key: string;
  value: string;
  sourcePlugin: string;
}

/** One setting the kernel draws for a plugin, out of what the plugin says it needs. */
export interface SettingField {
  key: string;
  kind: SettingFieldKind;
  label: string;
  required: boolean;
}

/** One setting the user filled in, as the kernel hands it back to the plugin that asked for it. The value is a string whatever the field's kind was, because what a value means is the plugin's own business — the kernel draws four kinds of control and knows nothing about what is in them. */
export interface SettingValue {
  key: string;
  value: string;
}

/** The four kinds of setting field the kernel draws. */
export type SettingFieldKind = 'text' | 'textarea' | 'toggle' | 'directory';

/** What the kernel hands the contributions at `app.page`. */
export interface AppPageParams {
  space: SpaceRef;
}

/** What the contributions at `app.page` hand back: nothing. */
export interface AppPageResult {}

/** What the kernel hands the contributions at `video.panel`. */
export interface VideoPanelParams {
  space: SpaceRef;
  video: VideoRef;
}

/** What the contributions at `video.panel` hand back: nothing. */
export interface VideoPanelResult {}

/** What the kernel hands the contributions at `video.fields`. */
export interface VideoFieldsParams {
  space: SpaceRef;
  video: VideoRef;
  fields: SourcedFieldValue[];
}

/** What the contributions at `video.fields` hand back. */
export interface VideoFieldsResult {
  fields: FieldValue[];
}

/** What the kernel hands the contributions at `plugin.settings`. */
export interface PluginSettingsParams {
  space: SpaceRef;
  values: SettingValue[];
}

/** What the contributions at `plugin.settings` hand back. */
export interface PluginSettingsResult {
  fields: SettingField[];
}

/** What the kernel hands the contributions at `scan.completed`. */
export interface ScanCompletedParams {
  space: SpaceRef;
  videos: VideoRef[];
}

/** What the contributions at `scan.completed` hand back: nothing. */
export interface ScanCompletedResult {}

/** What the kernel hands the contributions at `video.actions`. */
export interface VideoActionsParams {
  space: SpaceRef;
  video: VideoRef;
}

/** What the contributions at `video.actions` hand back: nothing. */
export interface VideoActionsResult {}

/** One entry of the catalog, as the registry reads it. */
export interface MountPoint {
  readonly key: MountPointKey;
  readonly category: MountCategory;
  readonly kind: MountKind;
  readonly side: MountSide;
  readonly scope: MountScope;
  readonly merge: MergeRule;
}

/** The keys of the closed set. */
export type MountPointKey =
  | 'app.page'
  | 'video.panel'
  | 'video.fields'
  | 'plugin.settings'
  | 'scan.completed'
  | 'video.actions';

/** The six mount points, in catalog order. */
export const MOUNT_POINTS: readonly MountPoint[] = [
  {
    key: 'app.page',
    category: 'interface',
    kind: 'list',
    side: 'interface',
    scope: 'app',
    merge: 'overlay',
  },
  {
    key: 'video.panel',
    category: 'interface',
    kind: 'list',
    side: 'interface',
    scope: 'video',
    merge: 'overlay',
  },
  {
    key: 'video.fields',
    category: 'data',
    kind: 'chain',
    side: 'body',
    scope: 'video',
    merge: 'first-non-empty',
  },
  {
    key: 'plugin.settings',
    category: 'data',
    kind: 'list',
    side: 'body',
    scope: 'plugin',
    merge: 'overlay',
  },
  {
    key: 'scan.completed',
    category: 'flow',
    kind: 'list',
    side: 'body',
    scope: 'scan',
    merge: 'overlay',
  },
  {
    key: 'video.actions',
    category: 'action',
    kind: 'list',
    side: 'body',
    scope: 'video',
    merge: 'overlay',
  },
];
