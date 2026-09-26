import { mockIPC, mockConvertFileSrc } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import type {
  AppError,
  ScanStatus,
  Space,
  UpdateCheck,
  UpdateProgress,
  Video,
} from '../src/shared/api';
import type { SettingsState } from '../src/settings/SettingsProvider';

// Every space holds the same files, because that is what spaces are: the same
// path is a different record in each of them (ADR 0011). What a space keeps for
// itself is which of them the user favourited, and that is what this holds --
// keyed by the space id the command carried, not by the one the fixture thinks
// the interface is on. Answering the wrong space is the mistake this harness
// exists to make visible, and it cannot make it visible while it corrects for it.
const favorites = new Map<number, Set<number>>([[1, new Set([1])]]);
function favoritesOf(spaceId: number) {
  const held = favorites.get(spaceId) ?? new Set<number>();
  favorites.set(spaceId, held);
  return held;
}

const videos: Video[] = Array.from({ length: 36 }, (_, index) => ({
  id: index + 1,
  path: `/acceptance/${index % 2 ? 'Archive' : 'Movies'}/video-${String(index + 1).padStart(2, '0')}.mp4`,
  file_name: `video-${String(index + 1).padStart(2, '0')}.mp4`,
  folder_path: `/acceptance/${index % 2 ? 'Archive' : 'Movies'}`,
  file_size: 8100 + index * 1000,
  modified_at: 1720000000000 + index,
  duration_ms: 65000,
  width: 1920,
  height: 1080,
  codec: 'h264',
  thumbnail_path: null,
  favorite: index === 0,
  play_count: 0,
  last_played_at: null,
  created_at: 1720000000000 + index,
  updated_at: 1720000000000 + index,
}));
let language = 'en';
let settings: SettingsState = { language: 'en', theme: 'dark' };
// The acceptance fixture stands in for the backend, so the space rules are
// repeated here rather than shared with it: they are the backend's, and the
// tests that hold them are Rust's. What they are for here is letting someone
// walking the interface see a refusal reported, which they could not otherwise.
const NAME_MAX = 24;
let spaces: Space[] = [{ id: 1, name: 'Acceptance' }];
let currentSpaceId = 1;
function currentSpace(): Space {
  return spaces.find((space) => space.id === currentSpaceId)!;
}
function refusalFor(raw: string, ignore?: number): AppError | null {
  const name = raw.trim();
  if (!name)
    return { code: 'space.name.empty', params: {}, errorId: 'acceptance' };
  if ([...name].length > NAME_MAX)
    return {
      code: 'space.name.too_long',
      params: { max: String(NAME_MAX) },
      errorId: 'acceptance',
    };
  const taken = spaces.some(
    (space) =>
      space.id !== ignore && space.name.toLowerCase() === name.toLowerCase(),
  );
  return taken
    ? { code: 'space.name.taken', params: { name }, errorId: 'acceptance' }
    : null;
}
let scan: ScanStatus = {
  background: false,
  phase: 'complete',
  discovered: 36,
  processed: 36,
  indexed: 36,
  metadataReady: 36,
  thumbnailsReady: 0,
  failures: 0,
  unreachableDirectories: 0,
  currentPath: '',
  changes: { added: 0, updated: 0, removed: 0 },
};
let updateCheck: UpdateCheck = {
  supported: true,
  currentVersion: '0.1.0',
  available: null,
  readyToRestart: false,
};

/**
 * The transfer the acceptance page is in the middle of, if any, and how far it
 * has got.
 *
 * A real download answers only when it ends, so this holds the command's
 * promise open and lets `control_update` settle it the way the backend would.
 * Without that the pause, continue and cancel buttons could not be walked at
 * all: the section only shows them while a transfer is running, and nothing
 * short of a real 89 MB release makes one run.
 */
let transfer: {
  version: string;
  downloaded: number;
  total: number;
  settle: (ended: UpdateProgress) => void;
} | null = null;
mockConvertFileSrc('macos');
Object.defineProperty(window, 'isTauri', { value: true });
mockIPC(
  (command, args) => {
    const payload =
      args &&
      !Array.isArray(args) &&
      !(args instanceof ArrayBuffer) &&
      !(args instanceof Uint8Array)
        ? args
        : {};
    switch (command) {
      case 'get_language':
        return { preference: language, language };
      case 'set_language':
        language = String(payload.preference);
        return { preference: language, language };
      case 'get_settings':
        return { ...settings };
      case 'save_settings':
        settings = { ...(payload.settings as SettingsState) };
        return { ...settings };
      case 'current_space':
        return { ...currentSpace() };
      case 'list_spaces':
        return spaces.map((space) => ({ ...space }));
      case 'create_space': {
        const refusal = refusalFor(String(payload.name));
        if (refusal) throw refusal;
        const created = {
          id: Math.max(...spaces.map((space) => space.id)) + 1,
          name: String(payload.name).trim(),
        };
        spaces = [...spaces, created];
        currentSpaceId = created.id;
        return { ...created };
      }
      case 'rename_space': {
        const target = Number(payload.spaceId);
        const refusal = refusalFor(String(payload.name), target);
        if (refusal) throw refusal;
        spaces = spaces.map((space) =>
          space.id === target
            ? { ...space, name: String(payload.name).trim() }
            : space,
        );
        return { ...currentSpace() };
      }
      case 'delete_space': {
        const target = Number(payload.spaceId);
        if (spaces.length <= 1)
          throw {
            code: 'space.remove_last',
            params: {},
            errorId: 'acceptance',
          };
        spaces = spaces.filter((space) => space.id !== target);
        if (currentSpaceId === target) currentSpaceId = spaces[0].id;
        return { ...currentSpace() };
      }
      case 'switch_space': {
        const target = Number(payload.spaceId);
        if (!spaces.some((space) => space.id === target))
          throw { code: 'space.not_found', params: {}, errorId: 'acceptance' };
        currentSpaceId = target;
        return { ...currentSpace() };
      }
      case 'list_videos': {
        const held = favoritesOf(Number(payload.spaceId));
        return videos.map((video) => ({
          ...video,
          favorite: held.has(video.id),
        }));
      }
      case 'list_directories':
        return ['/acceptance/Movies', '/acceptance/Archive'];
      case 'scan_status':
        return scan;
      case 'open_video':
        throw {
          code: 'media.player.start_failed',
          params: {},
          errorId: 'acceptance-open-failure',
        };
      case 'set_favorite': {
        const video = videos.find((video) => video.path === payload.path);
        if (!video) return;
        const held = favoritesOf(Number(payload.spaceId));
        if (Boolean(payload.favorite)) held.add(video.id);
        else held.delete(video.id);
        return;
      }
      case 'check_for_update':
        return { ...updateCheck };
      case 'install_update': {
        // Continuing a paused download is this same command, so a second press
        // arrives here and opens a fresh transfer rather than a resumed one --
        // close enough for a walkthrough of the buttons, which is what this
        // entry is for.
        const version =
          updateCheck.available?.version ?? updateCheck.currentVersion;
        const held = { version, downloaded: 12_000_000, total: 42_000_000 };
        void emit('update-progress', { phase: 'downloading', ...held });
        return new Promise<UpdateProgress>((resolve) => {
          transfer = { ...held, settle: resolve };
        });
      }
      case 'control_update': {
        const held = transfer;
        transfer = null;
        // Nothing running means a paused download is being dismissed, which is
        // exactly what the backend answers with no transfer to tell.
        if (!held) return;
        held.settle(
          payload.action === 'pause'
            ? {
                phase: 'paused',
                downloaded: held.downloaded,
                total: held.total,
                version: held.version,
              }
            : {
                phase: 'cancelled',
                downloaded: 0,
                total: null,
                version: held.version,
              },
        );
        return;
      }
      case 'restart_app':
        return;
      default:
        console.warn(`Unexpected acceptance command: ${command}`);
        throw new Error(`Unexpected acceptance command: ${command}`);
    }
  },
  { shouldMockEvents: true },
);
Object.assign(window, {
  enjoyAcceptance: {
    setScan: async (phase: string) => {
      scan = {
        ...scan,
        phase,
        processed: 18,
        thumbnailsReady: 18,
        currentPath: videos[35].path,
      };
      await emit('scan-progress', scan);
    },
    // Covers the four shapes the update section can render from a check.
    // Nothing is checked at startup, so press "Check for updates" first and
    // call this after it: the section renders from the answer that press brings
    // back. The progress and paused shapes are not here — they belong to a
    // transfer, so press "Download" and then "Pause" to see those.
    setUpdate: async (
      state: 'none' | 'available' | 'ready' | 'unsupported',
    ) => {
      const release = {
        version: '0.2.0',
        currentVersion: '0.1.0',
        notes: 'Faster thumbnail generation.\nFixed a crash on empty folders.',
        date: '2026-09-01T00:00:00Z',
      };
      updateCheck = {
        supported: state !== 'unsupported',
        currentVersion: '0.1.0',
        available: state === 'available' || state === 'ready' ? release : null,
        readyToRestart: state === 'ready',
      };
    },
  },
});
