import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { open } from '@tauri-apps/plugin-dialog';

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

export interface ScanStatus {
  operation?: 'scan' | 'thumbnails';
  changes: { added: number; updated: number; removed: number };
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
 */
export interface ShareStatus {
  port: number | null;
  missingFiles: number;
}

/**
 * What the user chose about the application itself, as opposed to about a
 * space: the language preference and the theme.
 */
export interface SettingsState {
  language: 'system' | 'zh-CN' | 'en';
  theme: 'system' | 'light' | 'dark';
}

/**
 * Everything the interface asks of the backend, and everything the backend
 * tells it, in one module.
 *
 * The backend is one seam, but it was addressed from four packages: the library
 * commands here, the settings in the provider that reads them, the language and
 * the space in the two modules that read those before the interface renders,
 * the pushed messages beside each of their subscribers, the folder dialog in
 * the button that opens it, and the thumbnail URL in the card that shows one.
 * Six kinds of thing, each naming a Tauri export of its own — so "what can this
 * interface ask of its backend" could only be answered by reading all of them,
 * and `check-commands.mjs` could only cover the call sites it happened to know
 * about.
 *
 * What that cost is concrete: with no backend behind the window — the browser
 * development build — every command answers nothing, and the two facts the
 * interface reads before it can render were each written their own stand-in, in
 * their own module, disagreeing about what a backend-less build is. Here they
 * are answered once, by [`readCurrentSpace`] and [`readLanguage`] below.
 *
 * The pushed messages are one method per message rather than one `listen` the
 * caller names, mirroring the `Events` trait on the other side of the seam and
 * for the same reason: a message name is a bare string that nothing checks, so
 * it is written once, here, instead of at each subscriber.
 */

export const libraryApi = {
  // Opening the file's folder is the system file manager's job, not the
  // library's: it is addressed to a path, which one space already names.
  reveal: (path: string) => revealItemInDir(path),
  listSpaces: () => invoke<Space[]>('list_spaces'),
  // Each of the three that change the set of spaces answers with the one to
  // show afterwards, so moving between them never costs a second round trip
  // and never leaves the interface on a space that is already gone.
  createSpace: (name: string) => invoke<Space>('create_space', { name }),
  renameSpace: (spaceId: number, name: string) =>
    invoke<Space>('rename_space', { spaceId, name }),
  deleteSpace: (spaceId: number) => invoke<Space>('delete_space', { spaceId }),
  switchSpace: (spaceId: number) => invoke<Space>('switch_space', { spaceId }),
  regenerate: (spaceId: number, path: string | null) =>
    invoke<void>('regenerate_thumbnails', { spaceId, path }),
  list: (spaceId: number) => invoke<Video[]>('list_videos', { spaceId }),
  directories: (spaceId: number) =>
    invoke<string[]>('list_directories', { spaceId }),
  // The scan slot is the application's, not a space's: one scan runs at a time
  // and the progress it reports belongs to the space it was started on.
  scanStatus: () => invoke<ScanStatus>('scan_status'),
  controlScan: (action: 'pause' | 'resume' | 'cancel') =>
    invoke<void>('scan_action', { action }),
  favorite: (spaceId: number, path: string, favorite: boolean) =>
    invoke<void>('set_favorite', { spaceId, path, favorite }),
  // A mark on a record, as a favorite is, so it is addressed and answered the
  // same way. Which videos it marks is the space's business; what it means is
  // the share service's.
  shared: (spaceId: number, path: string, shared: boolean) =>
    invoke<void>('set_shared', { spaceId, path, shared }),
  remove: (spaceId: number, path: string) =>
    invoke<void>('remove_video', { spaceId, path }),
  removeDirectory: (spaceId: number, path: string) =>
    invoke<void>('remove_directory', { spaceId, path }),
  addDirectory: (spaceId: number, path: string) =>
    invoke<void>('add_directory', { spaceId, path }),
  // The scanned range is the space's saved directories; the backend reads them,
  // so there is no directory list to pass and no way to narrow the scan.
  rescan: (spaceId: number) =>
    invoke<Video[]>('rescan_directories', { spaceId }),
  play: (spaceId: number, path: string) =>
    invoke<void>('open_video', { spaceId, path }),
  refreshInfo: (spaceId: number, path: string) =>
    invoke<void>('refresh_video_info', { spaceId, path }),
  checkForUpdate: () => invoke<UpdateCheck>('check_for_update'),
  // Answers with how the transfer ended, so a download that was paused or
  // cancelled is told apart from one that finished without reading an event.
  installUpdate: () => invoke<UpdateProgress>('install_update'),
  // Named the way the scan's control is, and for the same reason: continuing is
  // not an action on a download but a download started again, so it has no name
  // here and goes through `installUpdate`.
  controlUpdate: (action: 'pause' | 'cancel') =>
    invoke<void>('control_update', { action }),
  // Installing hands the update to the platform installer and exits, so this
  // never answers a restart that worked; the caller swallows the rejection.
  restartApp: () => invoke<void>('restart_app'),
};

/**
 * The 共享服务, which belongs to no space of its own: it is one service for the
 * application, started by the user and ended when they say so or when the
 * application exits.
 *
 * Each of the three answers with the status that follows it, so a caller never
 * has to work out where it now stands: opening answers with the port that was
 * taken — which is not always the one asked for — and ending answers with the
 * one that says nothing is running. Reading is its own command because the
 * status is asked from every page, and a question that had to open a port to be
 * answered would turn looking at the interface into starting a service.
 */
export const shareApi = {
  status: () => invoke<ShareStatus>('share_status'),
  // The space is named because what the service offers is that space's 共享清单:
  // "the one on screen" is not an answer the backend can give, since it is the
  // interface that decides which space is being shown.
  open: (spaceId: number) => invoke<ShareStatus>('open_share', { spaceId }),
  close: () => invoke<ShareStatus>('close_share'),
};

/**
 * What the user chose about the application itself. Answers with what was
 * stored, so the caller is told what became of the patch rather than what it
 * asked for.
 */
export const settingsApi = {
  read: () => invoke<SettingsState>('get_settings'),
  save: (settings: SettingsState) =>
    invoke<SettingsState>('save_settings', { settings }),
};

/**
 * The language, and the preference behind it.
 *
 * `set` answers with the language the preference resolves to right now, which
 * is not the preference itself in follow-system mode — so the caller applies
 * what came back rather than what it sent.
 */
export const languageApi = {
  read: () => invoke<LanguageSettings>('get_language'),
  save: (preference: LanguageSettings['preference']) =>
    invoke<LanguageSettings>('set_language', { preference }),
};

/**
 * What the backend pushes, one subscription per message.
 *
 * Each answers with the function that stops it, as Tauri's own does — a
 * subscription nobody can stop is one that outlives the reader it was made for.
 */
export const backendEvents = {
  /** Where a pass has got to, which is also the status the interface shows. */
  onScanProgress: (
    handler: (status: ScanStatus) => void,
  ): Promise<UnlistenFn> =>
    listen<ScanStatus>('scan-progress', ({ payload }) => handler(payload)),
  /** The library is not what it was; whatever is showing it should read it again. */
  onLibraryChanged: (handler: () => void): Promise<UnlistenFn> =>
    listen('library-changed', handler),
  /** Something the user asked for did not happen, with the words for why. */
  onMediaError: (handler: (error: AppError) => void): Promise<UnlistenFn> =>
    listen<AppError>('media-error', ({ payload }) => handler(payload)),
  /** Where a download has got to. How it ended is the command's answer. */
  onUpdateProgress: (
    handler: (progress: UpdateProgress) => void,
  ): Promise<UnlistenFn> =>
    listen<UpdateProgress>('update-progress', ({ payload }) =>
      handler(payload),
    ),
};

/** Asks the user for folders, through the platform's own picker. */
export function pickDirectories(): Promise<string[] | null> {
  return open({ directory: true, multiple: true });
}

/**
 * A path the webview may load an image from.
 *
 * A thumbnail is a file on disk, which the webview will not fetch from a bare
 * path; the backend hands out the URL that stands for one, and this is the only
 * place that conversion is named.
 */
export function thumbnailUrl(path: string): string {
  return convertFileSrc(path);
}

/**
 * Whether there is a backend behind this window.
 *
 * Asked once, here. Everywhere else reads the answer by asking for the thing
 * itself — the two reads below are the only ones that have to know.
 */
function hosted(): boolean {
  return isTauri();
}

/**
 * The space the interface is showing, read before it is rendered: every library
 * query and every action is addressed to a space, so until one is known there
 * is nothing useful to ask for. A placeholder space would only be a wrong
 * answer shaped like a right one.
 */
export function readCurrentSpace(): Promise<Space> {
  if (!hosted()) return Promise.resolve({ id: 1, name: 'Enjoy' });
  return invoke<Space>('current_space');
}

/**
 * The language, read before the interface is rendered, so that what it renders
 * is already in the right one.
 *
 * Deliberately remembers nothing between calls: follow-system mode resolves the
 * system language again every time the app regains focus (baseline §10.1), so
 * answering out of a cache would pin the interface to whichever language
 * happened to be read first.
 *
 * With no backend, the browser answers for itself — the same decision as the
 * stand-in space above, made in the same place. The two used to be written in
 * the two modules that read them, which is how a build with no backend came to
 * have two different ideas of what one is.
 */
export function readLanguage(): Promise<LanguageSettings> {
  if (!hosted())
    return Promise.resolve({
      preference: 'system',
      language: navigator.language.toLowerCase().startsWith('zh')
        ? 'zh-CN'
        : 'en',
    });
  return languageApi.read();
}

export function normalizeError(error: unknown): AppError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'errorId' in error &&
    typeof error.errorId === 'string'
  ) {
    const params: Record<string, string> = {};
    if (
      'params' in error &&
      typeof error.params === 'object' &&
      error.params !== null
    ) {
      for (const [key, value] of Object.entries(error.params)) {
        if (typeof value === 'string') params[key] = value;
      }
    }
    return { code: error.code, errorId: error.errorId, params };
  }
  return { code: 'app.unexpected', params: {}, errorId: crypto.randomUUID() };
}
