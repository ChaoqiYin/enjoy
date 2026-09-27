import { describe, expect, it } from 'vitest';
import { idleScan } from '../../test/fixtures';
import { completionAutoCloseMs, shouldAnnounceScan } from './scanFeedback';

const completed = idleScan({
  phase: 'complete',
  discovered: 1,
  processed: 1,
  indexed: 1,
  metadataReady: 1,
  thumbnailsReady: 1,
  currentPath: '/movies',
});

describe('scan completion feedback', () => {
  it('announces a pass that finished, whatever it found', () => {
    expect(shouldAnnounceScan(completed)).toBe(true);
    // What a pass found is what the notice *says*, not whether it is shown: a
    // pass that changed nothing is still a pass the user asked for and watched.
    expect(
      shouldAnnounceScan({
        ...completed,
        changes: { ...completed.changes, added: 1 },
      }),
    ).toBe(true);
    expect(shouldAnnounceScan({ ...completed, failures: 1 })).toBe(true);
    expect(
      shouldAnnounceScan({ ...completed, unreachableDirectories: 1 }),
    ).toBe(true);
  });
  it('says nothing about a pass that stopped instead of finishing', () => {
    // Cancelled and failed passes leave the phase they stopped in, and a sweep
    // the user watched stop needs no announcement. Only the phase is asked.
    for (const phase of [
      'discovering',
      'processing',
      'paused',
      'cancelled',
      'failed',
    ]) {
      expect(shouldAnnounceScan({ ...completed, phase })).toBe(false);
    }
  });
  it('keeps a completion that reported failures until it is dismissed', () => {
    expect(
      completionAutoCloseMs({ ...completed, failures: 1 }),
    ).toBeUndefined();
  });
  it('does not let unreachable directories hold the notice open', () => {
    expect(
      completionAutoCloseMs({ ...completed, unreachableDirectories: 2 }),
    ).toBe(3000);
  });
  it('closes a clean completion after the agreed delay', () => {
    expect(completionAutoCloseMs(completed)).toBe(3000);
  });
});
