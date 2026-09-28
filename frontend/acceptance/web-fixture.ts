import { mockIPC, mockConvertFileSrc } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import type {
  AppError,
  ScanStatus,
  SettingsState,
  Space,
  UpdateCheck,
  UpdateProgress,
  Video,
} from '../src/shared/api';

// Every space holds the same files, because that is what spaces are: the same
// path is a different record in each of them (ADR 0011). What a space keeps for
// itself is which of them the user marked, and it keeps two marks: a favorite,
// and an entry on the 共享清单. Both are held the same way -- keyed by the space
// id the command carried, not by the one the fixture thinks the interface is on.
// Answering the wrong space is the mistake this harness exists to make visible,
// and it cannot make it visible while it corrects for it.
const marks = new Map<string, Set<number>>([['favorite:1', new Set([1])]]);
function markedOf(kind: Marker, spaceId: number) {
  const key = `${kind}:${spaceId}`;
  const held = marks.get(key) ?? new Set<number>();
  marks.set(key, held);
  return held;
}

/**
 * The two marks a space can put on a record, named by the field the command
 * carries them in, so one handler can serve both.
 */
type Marker = 'favorite' | 'shared';

function markOn(kind: Marker, payload: Record<string, unknown>) {
  const video = videos.find((video) => video.path === payload.path);
  if (!video) return;
  const held = markedOf(kind, Number(payload.spaceId));
  if (Boolean(payload[kind])) held.add(video.id);
  else held.delete(video.id);
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
  shared: false,
  play_count: 0,
  last_played_at: null,
  created_at: 1720000000000 + index,
  updated_at: 1720000000000 + index,
}));
let language = 'en';
let settings: SettingsState = { language: 'en', theme: 'dark' };
let sharePort: number | null = null;
let sharePassword = 'sample-passw0rd';
/// What a running service is checking against, which is the password it started
/// with and not the one stored now.
let served = sharePassword;
let drawnPasswords = 0;
/**
 * The status, composed the way the backend composes it: the port and the
 * password on one side, and on the other whether the service that is running is
 * still behind that password.
 */
/**
 * The clients a walkthrough is shown while the service is running.
 *
 * Dated from the moment the fixture loaded, so that the ages start from whenever
 * the walkthrough began rather than from the epoch. Two of them, one quiet for
 * long enough to be on its way out, and one that never gave a name — which is
 * the row the page has to render without a blank. Nothing here ages anything
 * out: the minute-long window is the backend's rule, and it is held by the
 * backend's own tests.
 */
const startedAt = Date.now();
const listedDevices = [
  { address: '192.168.1.24', name: 'Infuse/7.6.4', lastSeen: startedAt },
  { address: '192.168.1.31', name: null, lastSeen: startedAt - 42_000 },
];

function share() {
  return {
    port: sharePort,
    missingFiles: 0,
    username: 'enjoy',
    password: sharePassword,
    needsRestart: sharePort !== null && served !== sharePassword,
    devices: sharePort === null ? [] : listedDevices,
  };
}
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

/**
 * A command this fixture has no answer for is not the same thing as a command
 * that failed, and a walkthrough has to be able to tell them apart.
 *
 * The application reports a failure with a notice and a code, so the fixture's
 * gaps used to arrive looking exactly like the backend refusing to work: press
 * a button in a section this entry does not cover and the screen says the
 * operation failed. That is how a walkthrough ends up recording a defect that
 * only exists in the fixture. Raising the distinction where the person clicking
 * is already looking is the whole of this function — the throw still happens,
 * because letting an unanswered command quietly resolve would be worse.
 *
 * Both languages on purpose: this page renders the real application under a
 * fixture-owned language, and a banner about the fixture is not worth a
 * translation round trip.
 */
function unimplemented(command: string): never {
  const id = 'enjoy-acceptance-unimplemented';
  const existing = document.getElementById(id);
  const banner =
    existing ??
    Object.assign(document.createElement('div'), {
      id,
      style:
        'position:fixed;inset-inline:0;bottom:0;z-index:2147483647;' +
        'padding:10px 16px;background:#7f1d1d;color:#fff;' +
        'font:13px/1.6 system-ui,sans-serif;white-space:pre-wrap',
      textContent:
        '验收夹具没有实现这些命令，这不是应用失败 / ' +
        'the acceptance fixture has no answer for these commands, ' +
        'which is not an application failure:\n',
    });
  if (!existing) document.body.appendChild(banner);
  banner.append(`${command} `);
  throw new Error(`Unexpected acceptance command: ${command}`);
}

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
        const favorites = markedOf('favorite', Number(payload.spaceId));
        const shared = markedOf('shared', Number(payload.spaceId));
        return videos.map((video) => ({
          ...video,
          favorite: favorites.has(video.id),
          shared: shared.has(video.id),
        }));
      }
      case 'list_directories':
        return ['/acceptance/Movies', '/acceptance/Archive'];
      case 'scan_status':
        return scan;
      case 'scan_action': {
        // Only the phase. Pausing, resuming and cancelling a scan have rules
        // behind them — the single slot, the gates, the refusals, the rule that
        // a paused phase is not overwritten by the next file's progress — and
        // the tests holding those are Rust's. What a walkthrough needs from
        // this command is that the three buttons move the panel to the phase
        // they name; anything past that would be a third copy of the backend.
        const phase =
          payload.action === 'pause'
            ? 'paused'
            : payload.action === 'resume'
              ? 'processing'
              : 'cancelled';
        scan = {
          ...scan,
          phase,
          currentPath: phase === 'processing' ? videos[35].path : '',
        };
        // Not awaited: this handler is not an async function (the commands that
        // answer with a promise return one rather than awaiting inside), and a
        // command that has published its progress answers without waiting for
        // the event to be delivered.
        void emit('scan-progress', scan);
        return;
      }
      case 'open_video':
        throw {
          code: 'media.player.start_failed',
          params: {},
          errorId: 'acceptance-open-failure',
        };
      case 'set_favorite':
        return markOn('favorite', payload);
      case 'set_shared':
        return markOn('shared', payload);
      // The service itself is not here: what a walkthrough can check is that
      // the button moves the interface between its two states, and the port it
      // names is the one the interface would have to show. The credentials are
      // repeated here the way the space rules are — the backend's own tests hold
      // them — and what this copy is for is letting someone see the password
      // change under their hands, and the warning that follows it.
      case 'share_status':
        return share();
      case 'open_share':
        sharePort = 4918;
        // Started under whatever is stored now, so the warning goes away: the
        // service is behind the password on screen again.
        served = sharePassword;
        return share();
      case 'close_share':
        sharePort = null;
        return share();
      case 'regenerate_share_password':
        sharePassword = `drawn-${String(++drawnPasswords)}`;
        return share();
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
        unimplemented(command);
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
