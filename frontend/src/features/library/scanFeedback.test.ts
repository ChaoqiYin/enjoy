import { describe, expect, it } from 'vitest';
import type { ScanStatus } from '../../shared/api';
import { completionAutoCloseMs, shouldAnnounceScan } from './scanFeedback';

const completed: ScanStatus = {
  background: true,
  phase: 'complete',
  failures: 0,
  changes: { added: 0, updated: 0, removed: 0 },
  discovered: 1,
  processed: 1,
  indexed: 1,
  metadataReady: 1,
  thumbnailsReady: 1,
  currentPath: '/movies',
};

describe('scan completion feedback', () => {
  it('keeps silent background scans from replacing useful feedback', () => {
    expect(shouldAnnounceScan(completed)).toBe(false);
    expect(shouldAnnounceScan({ ...completed, background: false })).toBe(true);
  });
  it('announces background changes and failures only after completion', () => {
    for (const key of ['added', 'updated', 'removed']) {
      expect(
        shouldAnnounceScan({
          ...completed,
          changes: { ...completed.changes, [key]: 1 },
        }),
      ).toBe(true);
    }
    expect(shouldAnnounceScan({ ...completed, failures: 1 })).toBe(true);
    expect(
      shouldAnnounceScan({ ...completed, phase: 'processing', failures: 1 }),
    ).toBe(false);
  });
  it('keeps a completion that reported failures until it is dismissed', () => {
    expect(
      completionAutoCloseMs({ ...completed, failures: 1 }),
    ).toBeUndefined();
  });
  it('closes a clean completion after the agreed delay', () => {
    expect(completionAutoCloseMs(completed)).toBe(3000);
  });
});
