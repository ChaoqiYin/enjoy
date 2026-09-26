import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';

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
  background: boolean;
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

export interface UpdateProgress {
  phase: string;
  downloaded: number;
  total: number | null;
  version: string;
}

export const libraryApi = {
  // Opening the file's folder is the system file manager's job, not the
  // library's: it is addressed to a path, which one space already names.
  reveal: (path: string) => revealItemInDir(path),
  currentSpace: () => invoke<Space>('current_space'),
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
  installUpdate: () => invoke<void>('install_update'),
  // Installing hands the update to the platform installer and exits, so this
  // never answers a restart that worked; the caller swallows the rejection.
  restartApp: () => invoke<void>('restart_app'),
};

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
