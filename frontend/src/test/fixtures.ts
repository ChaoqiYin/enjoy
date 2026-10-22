import type {
  Address,
  Device,
  ScanStatus,
  TaskRow,
  Video,
} from '../shared/api';

/**
 * A scan that is not running, as the backend reports one.
 *
 * The shape is spelled out once because it is the shape of a struct the backend
 * owns: a field added there would otherwise have to be added to every test that
 * happened to write out a status, one at a time and each in its own way. Tests
 * that are about a particular phase say so by overriding what they need.
 *
 * This module is not test code that runs — vitest collects `*.test.ts` only —
 * it is the data those tests are built from, kept where they can all find it.
 */
export function idleScan(overrides: Partial<ScanStatus> = {}): ScanStatus {
  return {
    phase: 'idle',
    changes: { added: 0, updated: 0, removed: 0 },
    failures: 0,
    unreachableDirectories: 0,
    discovered: 0,
    processed: 0,
    indexed: 0,
    metadataReady: 0,
    thumbnailsReady: 0,
    currentPath: '',
    ...overrides,
  };
}

/**
 * One video, as the library hands it over: on no list, never played.
 *
 * The identity fields are the ones the record's own type declares, so a field
 * added to a video is a compile error here — which is what keeps the tests that
 * draw a card from having to be told about it one at a time.
 */
export function video(overrides: Partial<Video> = {}): Video {
  return {
    id: 1,
    path: '/movies/example.mp4',
    file_name: 'example.mp4',
    folder_path: '/movies',
    file_size: 1024,
    modified_at: 0,
    duration_ms: 65000,
    width: 1920,
    height: 1080,
    codec: 'h264',
    thumbnail_path: null,
    cover_path: null,
    favorite: false,
    shared: false,
    play_count: 0,
    last_played_at: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

/**
 * One task, as the task page reads it: a kernel task about a video, running.
 *
 * Spelled out once for the same reason as [`video`]: the shape belongs to the
 * backend, and a field added there should be one edit here rather than an edit
 * in every test that happened to write the row out itself.
 */
export function task(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 1,
    plugin: null,
    space_id: 1,
    space_name: 'Movies',
    video_id: 10,
    video_name: 'a.mkv',
    kind: 'move',
    state: 'running',
    pause_requested: false,
    cancel_requested: false,
    progress_current: null,
    progress_total: null,
    progress_label: null,
    attempts: 0,
    last_error: null,
    updated_at: 1_760_000_000_000,
    ...overrides,
  };
}

/**
 * An address this machine would be reached at, as the backend lists one.
 *
 * Here rather than beside the sharing page's doubles because it is data, not a
 * stand-in: the blocks that draw one are plain components now, and a test that
 * mounts one should not have to mount the sharing state to get at it.
 */
export function address(overrides: Partial<Address> = {}): Address {
  return {
    interface: 'Wi-Fi',
    address: '192.168.1.5',
    loopback: false,
    ...overrides,
  };
}

/** A client the backend has heard from, at a moment the test chooses. */
export function device(overrides: Partial<Device> = {}): Device {
  return {
    address: '192.168.1.24',
    name: 'Infuse/7.6.4',
    lastSeen: Date.now(),
    ...overrides,
  };
}
