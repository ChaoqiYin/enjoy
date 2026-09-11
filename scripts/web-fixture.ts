import { mockIPC, mockConvertFileSrc } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import type { ScanStatus, Video } from '../src/api';

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
  available: true,
  play_count: 0,
  last_played_at: null,
  created_at: 1720000000000 + index,
  updated_at: 1720000000000 + index,
}));
let language = 'en';
let scan: ScanStatus = {
  background: false,
  phase: 'complete',
  discovered: 36,
  processed: 36,
  indexed: 36,
  metadataReady: 36,
  thumbnailsReady: 0,
  failures: 0,
  currentPath: '',
  changes: { added: 0, updated: 0, unavailable: 0 },
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
      default:
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
  },
});
