import { mockIPC, mockConvertFileSrc } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import { videoPage } from './videoList';
import { videos } from './records';
import { control, reported, rescan, setPhase } from './scan';
import {
  control as controlUpdate,
  install,
  reported as reportedCheck,
  setCheck,
} from './update';
import type {
  AppError,
  SettingsState,
  ShareStatus,
  Space,
  Video,
  VideoQuery,
} from '../src/shared/api';

// Every space holds the same files, because that is what spaces are: the same
// path is a different record in each of them (ADR 0011). What a space keeps for
// itself is which of them the user marked, and it keeps two marks: a favorite,
// and an entry on the 共享清单. Both are held the same way -- keyed by the space
// id the command carried, not by the one the fixture thinks the interface is on.
// Answering the wrong space is the mistake this harness exists to make visible,
// and it cannot make it visible while it corrects for it.
//
// A space starts with a stretch of the library marked, thirty records long and
// shifted per mark, because 收藏, 最近播放 and 共享 are pages of this same
// collection asked three ways (ADR 0016): a listing holding one record can be
// shown in one shape and never turned to a second page, and three listings
// holding the same records would be three readings of one page rather than three
// pages a walkthrough can tell apart. Six records are left out of each, so a mark
// is visibly a mark rather than the library.
const marked = (first: number) =>
  Array.from({ length: 30 }, (_, step) => first + step);
const marks = new Map<string, Set<number>>([
  ['favorite:1', new Set(marked(7))],
  ['shared:1', new Set(marked(4))],
]);

/**
 * Whether a folder has been added, which is the whole of what the 首启 screen is
 * a screen of: no folders, and so no records.
 *
 * A switch rather than data, because no other state of these records reaches it
 * — thirty-six files and two folders are what a library looks like afterwards,
 * and a walkthrough that cannot see the screen a first run opens on cannot walk
 * the one empty state that takes the whole page (issue #46, whose subject was a
 * branch no walkthrough could reach).
 *
 * It is read off the address as well as flipped from the console, and that is
 * not decoration: the page reads a listing once and keeps the answer, so a
 * switch that only moved this copy left the screen showing the library it had
 * already read. `?library=empty` is the way in — the number is read while this
 * file loads, before the app has replaced the address with its own route — and
 * a walkthrough that reloads lands in the library it asked for. Without it the
 * 首启 screen is reachable only by a click no screen shows.
 */
const asked = new URLSearchParams(location.search).get('library');
let indexed = asked !== 'empty';

/** One record as the space being asked holds it: the files, and its own marks. */
function recordsOf(spaceId: number | undefined): Video[] {
  const favorites = markedOf('favorite', Number(spaceId));
  const shared = markedOf('shared', Number(spaceId));
  return videos.map((video) => ({
    ...video,
    favorite: favorites.has(video.id),
    shared: shared.has(video.id),
  }));
}
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
  // Nothing is recorded here about the service being out of step: a share mark
  // moved while one is running is noticed by the status comparing the list
  // against the snapshot it read, which is how the backend notices it too.
}

let language = 'en';
let settings: SettingsState = { language: 'en', theme: 'dark' };
let sharePort: number | null = null;
// Four digits, like the one the backend draws: what a client is told to type, and
// what this copy is for is letting someone see the screen the way a user sees it.
let sharePassword = '7315';
/// What a running service is checking against, which is the password it started
/// with and not the one stored now.
let served = sharePassword;
let drawnPasswords = 0;
/**
 * The 共享清单 as the running service read it: the ids of the space it was
 * started over, sorted the way the backend's own list is ordered, or `null`
 * when nothing is running.
 *
 * This is the snapshot the real service takes at start, and holding it is what
 * lets this copy answer the two questions the status carries about the list —
 * whether it has moved since, and how many of its files are gone — by comparing
 * rather than by being told. A flag set when a mark is toggled would answer the
 * same for the one change a walkthrough can make and nothing else; the backend's
 * rule is a comparison, so this is one too.
 */
let servedList: { spaceId: number; ids: number[] } | null = null;
/**
 * The videos whose file this copy declares to be gone.
 *
 * The real service finds these by looking at the disk when it starts, which is
 * the one thing a fixture cannot do. Declaring one is what makes the page's
 * "some files are gone" line reachable at all: it appears when one of these is
 * on the 共享清单, and a line no walkthrough can reach is a line nobody has
 * read on screen. Video 1 is the one the space starts with marked as a favorite,
 * so it is the one nearest to hand.
 */
const missingFromDisk = new Set([1]);

/** One space's 共享清单, in the order the backend would serve it. */
function sharedIds(spaceId: number): number[] {
  return [...markedOf('shared', spaceId)].sort((left, right) => left - right);
}

/**
 * The status, composed the way the backend composes it: the port and the
 * password on one side, and on the other the two facts about the service that
 * is running — whether it is still behind that password, and whether it is
 * still offering the list it read.
 *
 * `spaceId` is the space the interface is asking about, because that is what the
 * backend compares its snapshot against (ADR 0012): a service started over one
 * space's list is out of step with the list of the space now on screen.
 */
function share(spaceId?: number): ShareStatus {
  return {
    port: sharePort,
    missingFiles:
      servedList === null
        ? 0
        : servedList.ids.filter((id) => missingFromDisk.has(id)).length,
    username: 'enjoy',
    password: sharePassword,
    needsRestart: sharePort !== null && served !== sharePassword,
    listChanged:
      servedList !== null &&
      spaceId !== undefined &&
      servedList.ids.join(',') !== sharedIds(spaceId).join(','),
    devices: sharePort === null ? [] : listedDevices,
    addresses: sharePort === null ? [] : machineAddresses,
  };
}
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

/**
 * The addresses this machine would be reached at, in the order the backend puts
 * them in: the one a router handed out first, the machine talking to itself
 * last and marked. Three of them, so that a walkthrough sees a list rather than
 * a line — including one that looks like a local network and is a virtual
 * adapter, which is the case the interface name is there for.
 */
const machineAddresses = [
  { interface: '以太网', address: '192.168.50.91', loopback: false },
  { interface: 'vEthernet (WSL)', address: '172.20.0.1', loopback: false },
  {
    interface: 'Loopback Pseudo-Interface 1',
    address: '127.0.0.1',
    loopback: true,
  },
];

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
      case 'get_settings':
        return { ...settings };
      case 'save_settings':
        // The language and the theme together, in one write, the way the
        // preferences keep them: changing the language is this command now, and
        // what the interface is drawn in follows from the same answer.
        settings = { ...(payload.settings as SettingsState) };
        language = settings.language;
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
        // The whole query travels as this command's one argument, which is the
        // shape the interface sends (`libraryApi.list`) and the thing this
        // stand-in got wrong: read from the argument itself rather than from the
        // `query` inside it, every field but the space came back undefined and
        // the answer was the count of a list with nothing on the page. Nothing
        // caught it — this file's own tests asked in their own spelling — which
        // is why they now ask through `libraryApi` instead.
        const query = payload.query as VideoQuery;
        if (!indexed) return { items: [], total: 0 };
        return videoPage(recordsOf(query.spaceId), query);
      }
      case 'list_directories':
        return indexed ? ['/acceptance/Movies', '/acceptance/Archive'] : [];
      case 'scan_status':
        return reported();
      case 'scan_action':
        // Only the phase. Pausing, resuming and cancelling a scan have rules
        // behind them — the single slot, the gates, the refusals, the rule that
        // a paused phase is not overwritten by the next file's progress — and
        // the tests holding those are Rust's. What a walkthrough needs from this
        // command is that the three buttons move the panel to the phase they
        // name; anything past that would be a third copy of the backend.
        return control(String(payload.action), videos[35].path);
      case 'rescan_directories':
        // Answered, so that 扫描 moves the interface rather than raising the
        // banner this fixture reserves for the commands it has no answer for.
        // The pass is held open until it ends, like the command it stands in
        // for — see `scan.ts`, which is where being busy comes from.
        return rescan(recordsOf(Number(payload.spaceId)), videos[35].path);
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
        return share(Number(payload.spaceId));
      case 'open_share':
        sharePort = 4918;
        // Started under whatever is stored now, so the warning goes away: the
        // service is behind the password on screen again. The same for the list:
        // a service started now is offering the list as it stands now, which is
        // the snapshot it takes here.
        served = sharePassword;
        servedList = {
          spaceId: Number(payload.spaceId),
          ids: sharedIds(Number(payload.spaceId)),
        };
        return share(Number(payload.spaceId));
      case 'close_share':
        sharePort = null;
        servedList = null;
        // No space: nothing is running, and the answer says so in every field
        // the space was only ever needed for.
        return share();
      case 'close_window':
        // The window going away is the one answer a page cannot be shown: in
        // the application the backend ends the service and closes the window,
        // and here there is nothing left to do. Answered rather than left
        // unimplemented so that a walkthrough past the close question reads the
        // application rather than a banner about the fixture.
        return;
      case 'regenerate_share_password':
        sharePassword = `drawn-${String(++drawnPasswords)}`;
        return share(Number(payload.spaceId));
      case 'check_for_update':
        return reportedCheck();
      case 'install_update':
        return install();
      case 'control_update':
        return controlUpdate(payload.action);
      case 'restart_app':
        return;
      default:
        unimplemented(command);
    }
  },
  { shouldMockEvents: true },
);
/**
 * The states a walkthrough has to be put into by hand, because no walk of the
 * interface reaches them.
 *
 * Exported as well as hung on the window, so that this file's own tests call the
 * same handles the page does rather than a second spelling of them.
 */
export const acceptance = {
  setScan: async (phase: string) => {
    await setPhase(phase, videos[35].path);
  },
  setUpdate: async (state: 'none' | 'available' | 'ready' | 'unsupported') => {
    setCheck(state);
  },
  // A library with no folder added yet: see `indexed`. Every listing page is
  // then empty — the 视频库 one at the size 首启 draws, and the other three at
  // the size a list that has nothing in it draws — which is the empty state on
  // all four listings, from the one switch.
  //
  // Read by this file when it loads (`?library=empty`): the interface reads a
  // listing once and keeps it, so reaching the empty library in a walkthrough is
  // a page loaded with it rather than a click. This handle is the same switch
  // moved in place, which is what these tests want and what a console session
  // gets — a reload is what the address is for.
  setLibrary: (state: 'full' | 'empty') => {
    indexed = state === 'full';
  },
};
Object.assign(window, { enjoyAcceptance: acceptance });
