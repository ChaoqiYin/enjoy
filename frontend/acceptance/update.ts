import { emit } from '@tauri-apps/api/event';
import type { UpdateCheck, UpdateProgress } from '../src/shared/api';

/**
 * The update flow as this stand-in backend holds it: what a check answers, and
 * the download a command is in the middle of.
 *
 * Here rather than in the fixture's switch because the transfer is a state and
 * not an answer: a real download answers only when it ends, so `install_update`
 * holds its promise open and `control_update` settles it the way the backend
 * would. Without that the pause, continue and cancel buttons could not be walked
 * at all — the section only shows them while a transfer is running, and nothing
 * short of a real 89 MB release makes one run.
 */

let check: UpdateCheck = {
  supported: true,
  currentVersion: '0.1.0',
  available: null,
  readyToRestart: false,
};

/** The transfer in progress, with the answer its command is still holding. */
let transfer: {
  version: string;
  downloaded: number;
  total: number;
  settle: (ended: UpdateProgress) => void;
} | null = null;

/** What a check answers, as `check_for_update` gives it. */
export function reported(): UpdateCheck {
  return { ...check };
}

/**
 * Starts a download and answers when it ends.
 *
 * Continuing a paused download is this same command, so a second press arrives
 * here and opens a fresh transfer rather than a resumed one — close enough for a
 * walkthrough of the buttons, which is what this entry is for.
 */
export function install(): Promise<UpdateProgress> {
  const version = check.available?.version ?? check.currentVersion;
  const held = { version, downloaded: 12_000_000, total: 42_000_000 };
  void emit('update-progress', { phase: 'downloading', ...held });
  return new Promise<UpdateProgress>((settle) => {
    transfer = { ...held, settle };
  });
}

/**
 * 暂停 / 继续 / 取消, as `control_update` takes them.
 *
 * Nothing running means a paused download is being dismissed, which is exactly
 * what the backend answers with no transfer to tell.
 */
export function control(action: unknown) {
  const held = transfer;
  transfer = null;
  if (!held) return;
  held.settle(
    action === 'pause'
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
}

/**
 * The four shapes the update section can render from a check, for a walkthrough:
 * nothing is checked at startup, so press "Check for updates" first and call this
 * after it. The progress and paused shapes are not here — they belong to a
 * transfer, so press "Download" and then "Pause" to see those.
 */
export function setCheck(
  state: 'none' | 'available' | 'ready' | 'unsupported',
) {
  const release = {
    version: '0.2.0',
    currentVersion: '0.1.0',
    notes: 'Faster thumbnail generation.\nFixed a crash on empty folders.',
    date: '2026-09-01T00:00:00Z',
  };
  check = {
    supported: state !== 'unsupported',
    currentVersion: '0.1.0',
    available: state === 'available' || state === 'ready' ? release : null,
    readyToRestart: state === 'ready',
  };
}
