import type { ScanStatus } from '../shared/api';

/**
 * A scan that is not running, as the backend reports one.
 *
 * The shape is spelled out once because it is the shape of a struct the backend
 * owns: a field added there would otherwise have to be added to every test that
 * happened to write out a status, one at a time and each in its own way. Tests
 * that are about a particular phase say so by overriding what they need.
 *
 * This module is not test code that runs — vitest collects `*.test.ts` only —
 * it is the data those tests are built from, kept where they can all find it.
 */
export function idleScan(overrides: Partial<ScanStatus> = {}): ScanStatus {
  return {
    background: false,
    phase: 'idle',
    changes: { added: 0, updated: 0, removed: 0 },
    failures: 0,
    unreachableDirectories: 0,
    discovered: 0,
    processed: 0,
    indexed: 0,
    metadataReady: 0,
    thumbnailsReady: 0,
    currentPath: '',
    ...overrides,
  };
}
