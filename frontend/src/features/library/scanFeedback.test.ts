import { describe, expect, it } from 'vitest';
import { idleScan } from '../../test/fixtures';
import { completionAutoCloseMs, shouldAnnounceScan } from './scanFeedback';

const completed = idleScan({
  background: true,
  phase: 'complete',
  discovered: 1,
  processed: 1,
  indexed: 1,
  metadataReady: 1,
  thumbnailsReady: 1,
  currentPath: '/movies',
});

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
  it('announces a background scan that could not read a directory', () => {
    expect(
      shouldAnnounceScan({ ...completed, unreachableDirectories: 1 }),
    ).toBe(true);
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
