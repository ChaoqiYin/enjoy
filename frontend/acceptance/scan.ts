import { emit } from '@tauri-apps/api/event';
import type { AppError, ScanStatus, Video } from '../src/shared/api';

/**
 * The media pass as this stand-in backend holds it: what the last one reported,
 * and the one a command is waiting on.
 *
 * A pass is not one command's business, which is why it is a module rather than
 * a case in the fixture's switch: 扫描 and 缩略图重建 share one slot and report
 * through the same status (`isScanRunning`), the interface polls that status
 * while it runs and is sent it while it does, and two commands answer it with
 * the phase they moved it to.
 *
 * The pass a *command* starts is held open until that pass ends, because that is
 * what the backend does — `rescan_directories` is a media job and answers with
 * the records once the sweep is over — and holding it is the only way the
 * interface's busy state is reachable at all: a version of this that answered
 * immediately left the buttons that are disabled while a pass runs undrawn, and
 * the 扫描 button raising "the fixture has no answer for this command".
 *
 * The phases are the backend's words; which of them mean "running" is read off
 * `isScanRunning` rather than listed a second time here.
 */

const RUNNING = ['discovering', 'processing', 'paused'];

let status: ScanStatus = {
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

/** The pass a command is waiting on, and the records its answer will carry. */
let inFlight: {
  videos: Video[];
  settle: (videos: Video[]) => void;
  refuse: (error: AppError) => void;
} | null = null;

/** The status, as `scan_status` answers it. */
export function reported(): ScanStatus {
  return status;
}

function publish(next: ScanStatus): Promise<unknown> {
  status = next;
  return emit('scan-progress', next);
}

/**
 * Ends the pass being waited on, if one is: the command that started it answers
 * here and nowhere else.
 *
 * A cancelled pass refuses rather than answers, which is what the backend's own
 * cancellation does (`media.scan.cancelled`) and what the interface reads to
 * tell a sweep the user stopped from one that failed.
 */
function end(phase: 'complete' | 'cancelled') {
  void publish({ ...status, phase, currentPath: '' });
  const held = inFlight;
  inFlight = null;
  if (!held) return;
  if (phase === 'cancelled')
    held.refuse({
      code: 'media.scan.cancelled',
      params: {},
      errorId: 'acceptance',
    });
  else held.settle(held.videos);
}

/** Starts a pass and answers with its records once it ends. */
export function rescan(videos: Video[], currentPath: string): Promise<Video[]> {
  void publish({ ...status, phase: 'processing', currentPath });
  return new Promise<Video[]>((settle, refuse) => {
    inFlight = { videos, settle, refuse };
  });
}

/**
 * 暂停, 继续 and 取消, as `scan_action` takes them.
 *
 * The first two move the phase and leave the command waiting — a paused pass is
 * still a pass, and the slot it holds is what the interface reads as busy. 取消
 * is the one that ends it.
 */
export function control(action: string, currentPath: string) {
  if (action === 'cancel') return end('cancelled');
  void publish({
    ...status,
    phase: action === 'pause' ? 'paused' : 'processing',
    currentPath,
  });
}

/**
 * The same by hand, for a walkthrough: the four shapes a pass is shown in.
 *
 * A phase that is no longer running has ended, so naming one here ends the pass
 * a command is waiting on — the alternative is a walkthrough that pauses a scan
 * and then cannot get the interface out of being busy.
 */
export async function setPhase(phase: string, currentPath: string) {
  if (!RUNNING.includes(phase)) {
    end(phase === 'cancelled' ? 'cancelled' : 'complete');
    return;
  }
  await publish({
    ...status,
    phase,
    processed: 18,
    thumbnailsReady: 18,
    currentPath,
  });
}
