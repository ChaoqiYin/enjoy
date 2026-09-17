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
  reveal: (path: string) => revealItemInDir(path),
  regenerate: (path: string | null) =>
    invoke<void>('regenerate_thumbnails', { path }),
  list: () => invoke<Video[]>('list_videos'),
  directories: () => invoke<string[]>('list_directories'),
  scanStatus: () => invoke<ScanStatus>('scan_status'),
  controlScan: (action: 'pause' | 'resume' | 'cancel') =>
    invoke<void>('scan_action', { action }),
  favorite: (path: string, favorite: boolean) =>
    invoke<void>('set_favorite', { path, favorite }),
  remove: (path: string) => invoke<void>('remove_video', { path }),
  removeDirectory: (path: string) => invoke<void>('remove_directory', { path }),
  addDirectory: (path: string) => invoke<void>('add_directory', { path }),
  // The scanned range is the saved directories; the backend reads them, so
  // there is no directory list to pass and no way to narrow the scan.
  rescan: () => invoke<Video[]>('rescan_directories'),
  play: (path: string) => invoke<void>('open_video', { path }),
  refreshInfo: (path: string) => invoke<void>('refresh_video_info', { path }),
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
