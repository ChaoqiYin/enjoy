/**
 * The shapes that cross the seam, and nothing else.
 *
 * Every one of these is a Rust struct serialised into the window, and the two
 * declarations are held to each other by `scripts/check-seam.mjs`, which reads
 * the interfaces *declared* in the files it is pointed at. They live here rather
 * than beside the calls that use them for two reasons: `api.ts` is at the line
 * limit every file is kept under, and a page of calls is read for what can be
 * asked of the backend while this file is read for what answer comes back — the
 * two questions are better read apart than stacked.
 *
 * What must not move with them is `invoke`: `check-commands.mjs` allows the Tauri
 * runtime to be imported from `api.ts` and from nowhere else, so the module that
 * says which commands exist stays there and re-exports these names, which keeps
 * every existing import path working.
 */

export interface Video {
  id: number;
  path: string;
  file_name: string;
  folder_path: string;
  file_size: number;
  modified_at: number;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  thumbnail_path: string | null;
  favorite: boolean;
  /** 共享清单: one of the videos this space offers over the share service. */
  shared: boolean;
  play_count: number;
  last_played_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * One self-contained library: its own scan directories, records, favorites and
 * play history. Spaces share no records at all — the same path is a different
 * video in each of them (ADR 0011).
 */
export interface Space {
  id: number;
  name: string;
}

export interface AppError {
  code: string;
  params: Record<string, string>;
  errorId: string;
}

/**
 * What one pass changed, counted by kind. Named here rather than written out
 * inline in `ScanStatus`, so that the shape the backend sends and the shape the
 * interface reads can be held to each other by name (see
 * `scripts/check-seam.mjs`).
 */
export interface IndexChanges {
  added: number;
  updated: number;
  removed: number;
}

export interface ScanStatus {
  operation?: 'scan' | 'thumbnails';
  changes: IndexChanges;
  failures: number;
  unreachableDirectories: number;
  phase: string;
  discovered: number;
  processed: number;
  indexed: number;
  metadataReady: number;
  thumbnailsReady: number;
  currentPath: string;
}

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  notes: string | null;
  /** RFC 3339, or null when the release does not carry a date. */
  date: string | null;
}

export interface UpdateCheck {
  /** False on platforms the updater does not publish for; no request is made. */
  supported: boolean;
  currentVersion: string;
  available: AvailableUpdate | null;
  readyToRestart: boolean;
}

/**
 * One progress report. `downloading` while bytes are arriving, and then the
 * ending: `ready` (the installer is verified and held, only a restart is
 * missing), `paused` (the bytes are held for continuing) or `cancelled`.
 *
 * The ending is not sent as an event. `installUpdate` answers with the last
 * report of the transfer, so the section settles on exactly one state instead
 * of on whichever of an event and an answer arrived first.
 */
export interface UpdateProgress {
  phase: 'downloading' | 'ready' | 'paused' | 'cancelled';
  downloaded: number;
  total: number | null;
  version: string;
}

/**
 * The language, as the backend resolves it: the preference the user chose and
 * the language that preference comes to right now. They differ in
 * follow-system mode, which is the whole reason both are sent.
 */
export interface LanguageSettings {
  preference: 'system' | 'zh-CN' | 'en';
  language: 'zh-CN' | 'en';
}

/**
 * The 共享服务 as the interface sees it: the port it is listening on, or null
 * when it is not running.
 *
 * `port` is the whole of the first fact. Whether the service is running *is*
 * whether it has a port, and a flag beside a port would be two answers to one
 * question with nothing keeping them in step.
 *
 * `missingFiles` is the second fact, and it is about the list rather than the
 * service: videos the user picked whose file is not on disk any more, counted
 * when the service starts because that is when the list is read. It is zero
 * when nothing is running.
 *
 * `username` and `password` are what a device is told to connect with, and they
 * come in the same answer because they are read off the same page: a page that
 * asked twice could show a password beside a port it does not go with.
 * `needsRestart` is the one thing that cannot be worked out from them — whether
 * the service that is running is still behind the password shown above it, which
 * it stops being the moment the user regenerates one.
 *
 * `listChanged` is the same shape of fact about the list: a service offers the
 * 共享清单 it was started over, and the 共享清单 can be picked at while it runs.
 * The backend compares the two lists rather than being told that something was
 * toggled, so a record that a rescan deleted counts as a change too.
 *
 * `devices` is the one part of this that changes without the user doing
 * anything, which is why the page reads the whole status again on a timer while
 * the service is running.
 *
 * `addresses` is where this machine can be reached, which the backend reads
 * from the operating system: an address and a port are two halves of the one
 * thing a user types into a television, and they are read together so that they
 * cannot be shown as a pair that does not go together.
 */
export interface ShareStatus {
  port: number | null;
  missingFiles: number;
  username: string;
  password: string;
  needsRestart: boolean;
  listChanged: boolean;
  devices: Device[];
  addresses: Address[];
}

/**
 * One address this machine can be reached at, in the order to try them: the
 * ones a router handed out first, the machine talking to itself last.
 */
export interface Address {
  /** The interface, as the operating system names it: `Wi-Fi`, `以太网`. */
  interface: string;
  /** The IPv4 address, on its own: the port is the service's, not the machine's. */
  address: string;
  /** Whether this is the machine talking to itself — the one that cannot reach
   * a television. */
  loopback: boolean;
}

/**
 * A client that has talked to the service recently.
 *
 * There is no `online` here to go with it, and that is the protocol's own
 * answer: a WebDAV client opens a connection, takes what it asked for and
 * closes it, so "connected" is a word this service has nothing to be. What it
 * has is the last request and when it arrived.
 */
export interface Device {
  /** The address the request came from, as the socket had it. */
  address: string;
  /**
   * What the client calls itself — the first product of its `User-Agent` — or
   * null when it sent nothing this could be read from. Null is not a reason to
   * leave the row out: the address and the time are the row.
   */
  name: string | null;
  /** When it was last heard from, in milliseconds since the epoch. */
  lastSeen: number;
}

/**
 * What the user chose about the application itself, as opposed to about a
 * space: the language preference and the theme.
 */
export interface SettingsState {
  language: 'system' | 'zh-CN' | 'en';
  theme: 'light' | 'dark';
}

/**
 * What the interface asks the library for: which of a space's records, in what
 * order, and which page of them.
 *
 * The whole description travels rather than the page being narrowed where it is
 * drawn, because a listing is one page of the library: a search applied to the
 * page in hand answers about that page, and the number of pages worked out from
 * it is wrong for the same reason (ADR 0016). The backend knows three dimensions
 * it never used to — favorite, shared, and whether a record has been played —
 * because those are what make a page the 收藏页, the 共享页 or the 最近播放页, and a
 * page cannot work them out about the records it does not hold.
 *
 * The three vocabularies are written as the words the backend accepts, so what
 * is not one of them is refused where it arrives rather than quietly answered
 * with something else.
 */
export interface VideoQuery {
  spaceId: number;
  /** Matched against the file name — what the card shows — and not the path. */
  search?: string;
  /** One directory, by the path its records were filed under. Exact, not a
   * prefix: the folder a record is filed under is a fact about that record. */
  folder?: string;
  only?: 'favorite' | 'shared' | 'played';
  sort?: 'added' | 'played' | 'name' | 'size';
  /** Absent means the direction the sort is usually read in. */
  direction?: 'asc' | 'desc';
  /** Where the page starts, counted in records the query matches. */
  offset: number;
  /** How many records the page holds. */
  limit: number;
}

/**
 * One page of a space's records, and how many the same question holds.
 *
 * The two arrive together because the interface draws them together: the records
 * fill the page, and the count is what says how many pages there are. Read apart,
 * the second could describe a different library than the first.
 */
export interface VideoPage {
  items: Video[];
  total: number;
}

/**
 * Why a plugin is not usable, in the kernel's error protocol rather than a
 * sentence somebody wrote: a code the interface has words for in both
 * languages, and the parameters those words ask for. A message from the plugin
 * itself would be text the interface cannot translate, cannot test, and cannot
 * hold to anything.
 */
export interface PluginFailure {
  code: string;
  params: Record<string, string>;
}

/**
 * One plugin as the kernel knows it **before** any interface is loaded.
 *
 * This is the bootstrap graph: which plugins there are, which of them the user
 * switched on, and where each one's interface lives. A plugin with no interface
 * — a body-only plugin, which is what the cover fetcher is — has a `null`
 * `entry` and is still a row on the page.
 *
 * `failure` is set when the kernel would not accept the plugin at all, and it
 * is a row rather than a silence: a plugin whose manifest does not validate is
 * listed with the reason, and the kernel goes on as though it were not
 * installed (spec #82 「清单校验」).
 */
export interface PluginBootstrap {
  id: string;
  /** The name the plugin gives itself, or its id when the manifest did not get
   *  far enough to give one. */
  name: string;
  author: string;
  /** The capabilities the manifest declares — what the user is told before they
   *  let the plugin in. */
  capabilities: string[];
  /** The interface's entry, as the absolute path the window loads it from. */
  entry: string | null;
  /** Whether the plugin declares a body half, which the runtime would run. */
  hasBody: boolean;
  enabled: boolean;
  failure: PluginFailure | null;
}

/**
 * What the user is shown before a plugin is copied in.
 *
 * The destination is the whole reason for the pre-flight: the user does not
 * know where plugins live, and "where will this land" is the first thing they
 * would ask.
 */
export interface PluginInstallPreview {
  destination: string;
  plugin: PluginBootstrap;
}

/**
 * One named thing a plugin has written about a record, and the plugin that
 * wrote it.
 *
 * The source is a bare string rather than a reference to a plugin that exists:
 * plugins live on disk and the library does not, so the two are not tied
 * together and a field outlives the plugin that wrote it. That is the whole of
 * why the interface is handed it — the panel has to say where a value came
 * from, including after that plugin has been uninstalled (User Story 10).
 *
 * The key is the plugin's own name for the field and is drawn as the plugin
 * wrote it: the kernel has no vocabulary for a plugin's fields to translate.
 */
export interface VideoField {
  key: string;
  value: string;
  source_plugin: string;
}
