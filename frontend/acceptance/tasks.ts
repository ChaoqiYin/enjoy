import type { TaskRow } from '../src/shared/api';

/**
 * The task queue a walkthrough is shown, and what its actions do to it.
 *
 * The backend's actions have rules behind them — a pause that is only asked
 * for, acknowledged later by a worker that may never get there — and those are
 * Rust's to hold (src-tauri/src/commands/tasks_tests.rs). What a walkthrough
 * needs is the part it can see: a press changes the row, so the button's
 * promise that something happens is readable on screen. Each action therefore
 * lands its state directly rather than passing through the acknowledgement
 * phase the real one waits for.
 *
 * Held in its own module for the same reason the scan and the update are:
 * the stand-in the walkthrough opens from is one file over its line limit, and
 * this is a state with rules of its own rather than a case of dispatch.
 */
let rows: TaskRow[] = [
  {
    id: 1,
    plugin: null,
    space_id: 1,
    space_name: 'Movies',
    video_id: 1,
    video_name: 'video-01.mp4',
    kind: 'move',
    state: 'running',
    pause_requested: false,
    cancel_requested: false,
    progress_current: 3,
    progress_total: 36,
    progress_label: 'files',
    attempts: 1,
    last_error: null,
    updated_at: Date.UTC(2026, 0, 15, 8, 30),
  },
  {
    id: 2,
    plugin: 'demo-plugin',
    space_id: 1,
    space_name: 'Movies',
    video_id: null,
    video_name: null,
    kind: 'index',
    state: 'failed',
    pause_requested: false,
    cancel_requested: false,
    progress_current: null,
    progress_total: null,
    progress_label: null,
    attempts: 3,
    last_error: 'The source disappeared mid-run',
    updated_at: Date.UTC(2026, 0, 15, 9, 0),
  },
];

/** The listing as `list_tasks` answers it: the whole queue, as it stands. */
export function list(): TaskRow[] {
  return rows;
}

/**
 * One action against one task, with the refusal the kernel answers unknown
 * ones with — so the notices corner a failure lands in is reachable from a
 * walkthrough the same way it is in the app.
 */
export function act(taskId: number, action: string): void {
  const task = rows.find((row) => row.id === taskId);
  if (!task) throw refusal();
  switch (action) {
    case 'pause':
      task.state = 'paused';
      break;
    case 'resume':
      task.state = 'running';
      break;
    case 'cancel':
      task.state = 'cancelled';
      break;
    case 'retry':
      task.state = 'pending';
      task.last_error = null;
      task.attempts += 1;
      break;
    default:
      throw refusal();
  }
  task.updated_at = Date.now();
}

function refusal() {
  return { code: 'task.invalid_action', params: {}, errorId: 'acceptance' };
}
