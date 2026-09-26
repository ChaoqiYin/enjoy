import { mockIPC, mockConvertFileSrc } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import type {
  AppError,
  ScanStatus,
  Space,
  UpdateCheck,
  Video,
} from '../src/shared/api';
import type { SettingsState } from '../src/settings/SettingsProvider';

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
      case 'list_videos':
        return videos.map((video) => ({ ...video }));
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
        if (video) video.favorite = Boolean(payload.favorite);
        return;
      }
      case 'check_for_update':
        return { ...updateCheck };
      case 'install_update':
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
    // Covers the four shapes the update section can render. Nothing is checked
    // at startup, so press "Check for updates" first and call this after it:
    // the section renders from the answer that press brings back. The "ready"
    // event only marks a version a check has already reported, so emit it
    // after that press too.
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
      if (state === 'ready') {
        await emit('update-progress', {
          phase: 'ready',
          downloaded: 0,
          total: null,
          version: release.version,
        });
      }
    },
  },
});
