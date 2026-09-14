import { invoke } from '@tauri-apps/api/core';

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
  available: boolean;
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
  changes: { added: number; updated: number; unavailable: number };
  failures: number;
  phase: string;
  discovered: number;
  processed: number;
  indexed: number;
  metadataReady: number;
  thumbnailsReady: number;
  currentPath: string;
}

export const libraryApi = {
  reveal: (path: string) => invoke<void>('reveal_video', { path }),
  regenerate: (path: string | null) =>
    invoke<void>('regenerate_thumbnails', { path }),
  list: () => invoke<Video[]>('list_videos'),
  directories: () => invoke<string[]>('list_directories'),
  scan: (path: string) => invoke<Video[]>('scan_directory', { path }),
  scanStatus: () => invoke<ScanStatus>('scan_status'),
  controlScan: (action: 'pause' | 'resume' | 'cancel') =>
    invoke<void>('scan_action', { action }),
  favorite: (path: string, favorite: boolean) =>
    invoke<void>('set_favorite', { path, favorite }),
  remove: (path: string) => invoke<void>('remove_video', { path }),
  removeDirectory: (path: string) => invoke<void>('remove_directory', { path }),
  addDirectory: (path: string) => invoke<void>('add_directory', { path }),
  rescan: (paths: string[]) => invoke<Video[]>('rescan_directories', { paths }),
  play: (path: string) => invoke<void>('open_video', { path }),
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
