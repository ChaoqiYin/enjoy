import { afterEach, expect, it, vi } from 'vitest';
import { libraryApi } from './api';
import { directoryScanAction } from './scanDirectories';

afterEach(() => vi.restoreAllMocks());

it('retries the failed directory without repeating completed directories', async () => {
  const failure = { code: 'media.scan.failed' };
  const scan = vi
    .spyOn(libraryApi, 'scan')
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(failure)
    .mockResolvedValue([]);
  const action = directoryScanAction(['/first', '/second', '/third']);
  await expect(action()).rejects.toEqual(failure);
  expect(scan.mock.calls.map(([path]) => path)).toEqual(['/first', '/second']);
  await action();
  expect(scan.mock.calls.map(([path]) => path)).toEqual([
    '/first',
    '/second',
    '/second',
    '/third',
  ]);
});

it('stops the batch when the current scan is cancelled', async () => {
  const cancelled = { code: 'media.scan.cancelled' };
  const scan = vi.spyOn(libraryApi, 'scan').mockRejectedValue(cancelled);
  await expect(directoryScanAction(['/first', '/second'])()).rejects.toEqual(
    cancelled,
  );
  expect(scan).toHaveBeenCalledExactlyOnceWith('/first');
});

it('deduplicates and snapshots the selected directories', async () => {
  const scan = vi.spyOn(libraryApi, 'scan').mockResolvedValue([]);
  const paths = ['/first', '/first', '/second'];
  const action = directoryScanAction(paths);
  paths.push('/later');
  await action();
  expect(scan.mock.calls.map(([path]) => path)).toEqual(['/first', '/second']);
});
