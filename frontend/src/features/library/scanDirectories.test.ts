import { afterEach, expect, it, vi } from 'vitest';
import { libraryApi } from '../../shared/api';
import { directoryScanAction } from './scanDirectories';

afterEach(() => vi.restoreAllMocks());

it.each([[], ['/first', '/second']])(
  'sends the complete directory snapshot in one request: %j',
  async (...paths) => {
    const rescan = vi.spyOn(libraryApi, 'rescan').mockResolvedValue([]);
    const directories = paths.filter(
      (path): path is string => typeof path === 'string',
    );
    await directoryScanAction(directories)();
    expect(rescan).toHaveBeenCalledExactlyOnceWith(directories);
  },
);

it('deduplicates and snapshots directories', async () => {
  const rescan = vi.spyOn(libraryApi, 'rescan').mockResolvedValue([]);
  const paths = ['/first', '/first', '/second'];
  const action = directoryScanAction(paths);
  paths.push('/later');
  await action();
  expect(rescan).toHaveBeenCalledExactlyOnceWith(['/first', '/second']);
});

it('retries the entire scan after failure', async () => {
  const failure = { code: 'media.scan.failed' };
  const rescan = vi
    .spyOn(libraryApi, 'rescan')
    .mockRejectedValueOnce(failure)
    .mockResolvedValue([]);
  const action = directoryScanAction(['/first', '/second']);
  await expect(action()).rejects.toEqual(failure);
  await action();
  expect(rescan.mock.calls).toEqual([
    [['/first', '/second']],
    [['/first', '/second']],
  ]);
});
