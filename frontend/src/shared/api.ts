import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { open } from '@tauri-apps/plugin-dialog';
import type { SettingValue } from '../plugins/mountPoints';
import type {
  AppError,
  LanguageSettings,
  PluginBootstrap,
  PluginFailure,
  PluginInstallPreview,
  PluginSettingsGroup,
  ScanStatus,
  SettingsState,
  ShareStatus,
  Space,
  UpdateCheck,
  UpdateProgress,
  Video,
  VideoField,
  VideoPage,
  VideoQuery,
} from './apiTypes';

// The shapes the answers arrive in are declared in their own module and handed
// on from here, so that every path that reads one — `from '../shared/api'`,
// which is all of them — keeps working while the declarations sit in a file
// `check-seam.mjs` can read a list of.
//
// They are named one by one rather than swept up with `export *`: this is the
// seam the interface reads the backend through, and a shape that reached it by
// being in the neighbourhood would be a shape nobody decided to hand out.
export type {
  Address,
  AvailableUpdate,
  AppError,
  Device,
  IndexChanges,
  LanguageSettings,
  PluginBootstrap,
  PluginFailure,
  PluginInstallPreview,
  PluginSettingField,
  PluginSettingsGroup,
  ScanStatus,
  SettingsState,
  ShareStatus,
  Space,
  UpdateCheck,
  UpdateProgress,
  Video,
  VideoField,
  VideoPage,
  VideoQuery,
} from './apiTypes';

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
  // One page of the library, as described by the query. The command name is the
  // same one it always was while what it takes is not, because the listing is one
  // thing the interface asks for however many questions its answer is made of —
  // and a second name would be a second way to ask for the same records (ADR 0016).
  list: (query: VideoQuery) => invoke<VideoPage>('list_videos', { query }),
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
  // same way. Which videos it marks is the space's; what it means, the service's.
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
  // The fields this video's plugins have written, and one plugin's own action on
  // it. Asking is what makes them current: the command puts the question to the
  // plugins and stores what they answer. An action is that question again, once
  // the plugin has been told to go and find something, and answers the same way.
  fields: (spaceId: number, path: string) =>
    invoke<VideoField[]>('refresh_video_fields', { spaceId, path }),
  runAction: (spaceId: number, path: string, pluginId: string) =>
    invoke<VideoField[]>('run_video_action', { spaceId, path, pluginId }),
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
 * The plugins installed on this machine: what is there, and what the user may do
 * about it. Two things about this group are decisions rather than plumbing.
 *
 * **Every command that changes something answers with the whole list as it now
 * stands**, the way the space commands answer with the space to show afterwards.
 * A caller that had to ask again could draw the two contradicting each other.
 *
 * **None of them reaches the running plugin host.** Installing, switching and
 * uninstalling take effect on the next start (spec #82 「不做热插拔」), so what
 * these answer with is the state of the disk rather than what this window runs.
 *
 * `preview` and `install` are one source read twice: the first says what
 * installing it would do and copies nothing, and the user is asked in between.
 * The source is a path the user picked — a folder, or a `.zip` holding one — and
 * there is no address to install from: v1 has no network install.
 *
 * `contentRows` is asked before an uninstall so that the question can say how
 * many rows of the library would go with the plugin: its own command, because it
 * is asked before anything is decided and its answer is a number the user reads.
 */
export const pluginApi = {
  list: () => invoke<PluginBootstrap[]>('list_plugins'),
  setEnabled: (pluginId: string, enabled: boolean) =>
    invoke<PluginBootstrap[]>('set_plugin_enabled', { pluginId, enabled }),
  // The whole order rather than a move, so that which ids are installed is the
  // kernel's to check: an id it never handed out is refused rather than written.
  setOrder: (order: string[]) =>
    invoke<PluginBootstrap[]>('set_plugin_order', { order }),
  preview: (source: string) =>
    invoke<PluginInstallPreview>('preview_plugin_install', { source }),
  install: (source: string) =>
    invoke<PluginBootstrap[]>('install_plugin', { source }),
  uninstall: (pluginId: string, deleteContent: boolean) =>
    invoke<PluginBootstrap[]>('uninstall_plugin', { pluginId, deleteContent }),
  contentRows: (pluginId: string) =>
    invoke<number>('plugin_content_rows', { pluginId }),
  // Every plugin is off now, and the page says so without asking again.
  safeMode: () => invoke<PluginBootstrap[]>('run_safe_mode'),
  // The settings form, read and written: both name the space (docs/插件系统.md §14.7).
  listSettings: (spaceId: number) =>
    invoke<PluginSettingsGroup[]>('list_plugin_settings', { spaceId }),
  saveSettings: (spaceId: number, pluginId: string, values: SettingValue[]) =>
    invoke<PluginSettingsGroup[]>('save_plugin_settings', {
      spaceId,
      pluginId,
      values,
    }),
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
  // The space is named by every one of these that reads a list, because what the
  // service offers is that space's 共享清单: "the one on screen" is not an answer
  // the backend can give, since it is the interface that decides which space is
  // being shown. Reading names it too: part of what reading answers is whether a
  // running service is still offering the list that space holds now.
  status: (spaceId: number) => invoke<ShareStatus>('share_status', { spaceId }),
  open: (spaceId: number) => invoke<ShareStatus>('open_share', { spaceId }),
  close: () => invoke<ShareStatus>('close_share'),
  // Answers with the whole status rather than the password alone: regenerating
  // it also decides whether a service that is running is still behind it, and a
  // caller that had to ask again for the second fact could draw the two
  // contradicting each other.
  regeneratePassword: (spaceId: number) =>
    invoke<ShareStatus>('regenerate_share_password', { spaceId }),
};

/**
 * The window this interface is drawn in, asked for the things it is asked of it:
 * to appear once there is something to show, to go away once the user has said
 * so, and to be minimized, resized and asked-to-close from the buttons the
 * interface draws in its corner. Every one is a command of the application's
 * own, which is what leaves the interface reaching into `@tauri-apps/api/window`
 * for nothing at all.
 *
 * Whether a close is held — and if so, that the user is asked first — is the
 * backend's decision, taken where the fact it rests on lives: only the backend
 * knows a service is running (`crate::closing`). It holds the close and tells
 * this side a question is due; the answer comes back here as a command, and the
 * window is closed by the side that decided it should wait. Nothing here
 * subscribes to the window, destroys it, or decides the close.
 *
 * The three the titlebar presses are the same three the window's own decorations
 * used to carry, and `requestClose` is the one of them that is a *request*:
 * pressing the button asks for the close, exactly as the platform's own button
 * did, and what becomes of the request is the paragraph above. `close` is the
 * other end of that — the user has answered yes.
 *
 * The command ends the service before the window goes, which is why the answer
 * to a yes is one call rather than two.
 *
 * `show` is the other direction. The window is created hidden and the backend
 * never shows it, because what its first visible frame should be — the theme,
 * the language, the space — is a fact only this side has. It is asked from one
 * place, `shared/WindowReveal.tsx`, on React's commit rather than on the theme
 * having been read: reading the theme is a step towards a drawn interface, and a
 * window shown on it would put an unstyleable page on screen. An answer that
 * never arrives means the window never appears; there is nothing behind it
 * putting the window up anyway (ADR 0037).
 */
export const windowApi = {
  show: (): Promise<void> => invoke<void>('show_window'),
  close: (): Promise<void> => invoke<void>('close_window'),
  minimize: (): Promise<void> => invoke<void>('minimize_window'),
  toggleMaximize: (): Promise<void> => invoke<void>('toggle_maximize_window'),
  requestClose: (): Promise<void> => invoke<void>('request_close_window'),
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
 * Reading answers with the language the preference resolves to right now, which
 * is not the preference itself in follow-system mode.
 *
 * Changing it is not here. The settings page is where a language is chosen, and
 * it goes through `settingsApi.save` with the theme beside it, because the two
 * are one file and one write (`crate::preferences`). A second command that
 * wrote the same key is how the application came to have two answers to which
 * language it was in: one the interface was drawn with, and one the native
 * menus and the 共享服务's landing page were written in, until the next run.
 */
export const languageApi = {
  read: () => invoke<LanguageSettings>('get_language'),
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
  /**
   * The window was asked to close while a 共享服务 is running, and is being held
   * while the user is asked about it.
   *
   * Carries nothing: what is being asked is a question this side already has the
   * words for, and what would close is the window it is drawn in. The answer
   * goes back as `windowApi.close`.
   */
  onCloseRequested: (handler: () => void): Promise<UnlistenFn> =>
    listen('close-requested', handler),
  /**
   * Whether the window is maximized, which is the picture on the titlebar's
   * middle button.
   *
   * Pushed rather than asked for, and pushed on the change rather than on every
   * measuring: the window is maximized just as well by a double click on the
   * title or by a drag to the top of the screen as by that button, and none of
   * those is a call this side makes (`crate::titlebar`).
   */
  onWindowMaximized: (
    handler: (maximized: boolean) => void,
  ): Promise<UnlistenFn> =>
    listen<boolean>('window-maximized', ({ payload }) => handler(payload)),
};

/** Asks the user for folders, through the platform's own picker. */
export function pickDirectories(): Promise<string[] | null> {
  return open({ directory: true, multiple: true });
}

/** Asks the user for one folder — a plugin's setting is one path, not a set. */
export function pickDirectory(): Promise<string | null> {
  return open({ directory: true, multiple: false });
}

/**
 * The two shapes a plugin comes in, asked for through the platform's own picker.
 *
 * One function with a flag rather than two, because the platform's picker is one
 * or the other and never both: a plugin is a folder a user unpacked, or the
 * `.zip` they downloaded. Which of the two they have is a fact only they know,
 * so it is asked rather than guessed — and the dialog that asks shows what each
 * one would install before anything is copied.
 */
export function pickPluginSource(archive: boolean): Promise<string | null> {
  const filters = [{ name: 'Plugin', extensions: ['zip'] }];
  return archive
    ? open({ multiple: false, filters })
    : open({ directory: true, multiple: false });
}

/**
 * Opens a page in the browser the user already has, rather than in this window.
 *
 * A window is the whole of this application — the library, the space it is
 * showing and the scan in flight are all in it — so navigating the webview to a
 * page would put that page where all of it was, and getting back would be the
 * browser's back button rather than anything this application draws. The
 * address therefore goes to the platform's opener, and the browser the user
 * already trusts the web to is what shows it.
 *
 * It is named here rather than left to an anchor for the same reason every
 * other reach is: Tauri hands a `_blank` navigation to the opener only when
 * something is there to take it, and drops it in silence otherwise — a click
 * that does nothing, with nothing said. A call this file makes is a call
 * `check-permissions.mjs` can hold against the capability that grants it.
 *
 * With no backend — the browser development build — the browser is already the
 * thing being asked for and answers for itself. Same decision as the two reads
 * below, made in the same place.
 */
export function openExternal(url: string): Promise<void> {
  if (!hosted()) {
    window.open(url, '_blank', 'noopener');
    return Promise.resolve();
  }
  return openUrl(url);
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
 * The URL a plugin interface's entry is loaded from.
 *
 * The same conversion as a thumbnail's, and here for the same reason: it is the
 * backend that hands out the URL a file on disk stands for, and this file is the
 * one address the backend is reached at (`check-commands.mjs`). The plugin host
 * imports this by name, and it is the name the source check holds the interface's
 * one dynamic import to — a plugin is a directory outside this build, so its
 * entry is reached for at run time, and this is what says where.
 */
export function pluginEntryUrl(entry: string): string {
  return convertFileSrc(entry);
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

/**
 * The theme, read before the interface is rendered, so that what it renders is
 * already drawn in the right one.
 *
 * It answers from the same stored preference the settings page shows, and that
 * is the whole point of it living here. The page read the preference and the
 * startup read a browser storage key nothing has ever written, so the two
 * disagreed for as long as the application has had two themes: the page said
 * "light" over an application drawn dark, and stayed that way until someone
 * clicked.
 *
 * With no backend, the browser answers with the theme the backend falls back to
 * for a preference it cannot resolve — the same decision as the stand-in space
 * and language above, made in the same place.
 */
export function readTheme(): Promise<SettingsState['theme']> {
  if (!hosted()) return Promise.resolve('dark');
  return settingsApi.read().then((settings) => settings.theme);
}

// Moved to its own module, and handed on from here so that every existing
// import path keeps working: the address the backend is reached at is at the
// line limit its module keeps, and this function reaches nothing.
export { normalizeError } from './normalizeError';
