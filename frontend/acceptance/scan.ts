import { emit } from '@tauri-apps/api/event';
import type { ScanStatus } from '../src/shared/api';

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
 * The three media commands do not run a pass — they queue one and answer with
 * the task's id, the way the kernel's queue does (spec #101). The work itself
 * happens in the background, so the pass this module holds stays open until
 * the walkthrough ends it: that is where the interface's status bar comes from,
 * and the id the command answered with is what the walkthrough is told about.
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

/**
 * The ids this queue hands out.
 *
 * They are ids of tasks the kernel would have put in its own queue, and the
 * walkthrough sees them the way it sees any other task id: a number that says
 * a task exists. The rows themselves are in `tasks.ts`, which is where the
 * task page reads them from.
 */
let nextTaskId = 100;

/** The status, as `scan_status` answers it. */
export function reported(): ScanStatus {
  return status;
}

function publish(next: ScanStatus): Promise<unknown> {
  status = next;
  return emit('scan-progress', next);
}

/**
 * Ends the pass that is running, if one is.
 *
 * A pass that is cancelled says so in the phase it publishes, which is where
 * the interface reads it from: the command that queued the work has long since
 * answered with a task id, and there is nothing left for it to refuse.
 */
function end(phase: 'complete' | 'cancelled') {
  void publish({ ...status, phase, currentPath: '' });
}

/**
 * Queues a pass and answers with the task's id, the way the kernel's queue
 * does: the work has not run when this answers (spec #101).
 *
 * The pass is running by the time the answer is read — the queue claims a task
 * at once — so the status bar is up and the page is usable underneath it.
 */
export function rescan(currentPath: string): number {
  void publish({ ...status, phase: 'processing', currentPath });
  return nextTaskId++;
}

/**
 * Queues a thumbnail rebuild and answers with the task's id.
 *
 * One file or all of them, and the difference is only what the pass walks: the
 * status says the same thing either way, which is what the kernel's own pass
 * reports as well.
 */
export function regenerate(currentPath: string): number {
  void publish({
    ...status,
    operation: 'thumbnails',
    phase: 'processing',
    currentPath,
  });
  return nextTaskId++;
}

/**
 * Queues a re-read of one file's metadata and answers with the task's id.
 *
 * Nothing is published: a single file has no progress to report, and the
 * backend's own refresh says as much by sending no status at all.
 */
export function refresh(): number {
  return nextTaskId++;
}

/**
 * 暂停, 继续 and 取消, as `scan_action` takes them.
 *
 * The first two move the phase and leave the pass running — a paused pass is
 * still a pass. 取消 is the one that ends it.
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
 * — the alternative is a walkthrough that pauses a scan and then cannot get the
 * interface out of showing it.
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
