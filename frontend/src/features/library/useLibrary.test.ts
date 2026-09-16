import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { libraryApi } from '../../shared/api';
import type { ScanStatus } from '../../shared/api';
import { useLibrary } from './useLibrary';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
const failure = {
  code: 'media.player.start_failed',
  params: {},
  errorId: 'err_retry',
};
let client: QueryClient;
beforeEach(() => {
  vi.mocked(listen).mockResolvedValue(() => {});
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(libraryApi, 'list').mockResolvedValue([]);
  vi.spyOn(libraryApi, 'directories').mockResolvedValue([]);
  vi.spyOn(libraryApi, 'scanStatus').mockResolvedValue({
    background: false,
    phase: 'idle',
    changes: { added: 0, updated: 0, removed: 0 },
    failures: 0,
    discovered: 0,
    processed: 0,
    indexed: 0,
    metadataReady: 0,
    thumbnailsReady: 0,
    currentPath: '',
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});
function mount() {
  return renderHook(useLibrary, {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}
it('retries the failed action and clears its error after success', async () => {
  const { result } = mount();
  const action = vi
    .fn()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce(undefined);
  await act(() => result.current.run(action));
  expect(result.current.error?.errorId).toBe('err_retry');
  expect(action).toHaveBeenCalledTimes(1);
  await act(() => result.current.retryError!());
  expect(action).toHaveBeenCalledTimes(2);
  expect(result.current.error).toBeNull();
  expect(result.current.busy).toBe(false);
});
it('surfaces directory query failures and retries the directory request', async () => {
  vi.mocked(libraryApi.directories).mockRejectedValueOnce(failure);
  const { result } = mount();
  await waitFor(() => expect(result.current.error?.errorId).toBe('err_retry'));
  await act(() => result.current.retryError!());
  await waitFor(() => expect(result.current.directories.isSuccess).toBe(true));
  expect(result.current.error).toBeNull();
});
it('allows scan query errors to be dismissed', async () => {
  vi.mocked(libraryApi.scanStatus).mockRejectedValue(failure);
  const { result } = mount();
  await waitFor(() => expect(result.current.error?.errorId).toBe('err_retry'));
  act(() => result.current.setError(null));
  expect(result.current.error).toBeNull();
});
const completed: ScanStatus = {
  background: false,
  phase: 'complete',
  changes: { added: 1, updated: 0, removed: 0 },
  failures: 0,
  discovered: 1,
  processed: 1,
  indexed: 1,
  metadataReady: 1,
  thumbnailsReady: 1,
  currentPath: '/movies',
};
it('clears the previous completion notice when a new action starts', async () => {
  const handlers = new Map<string, (event: { payload: unknown }) => void>();
  const capture = ((
    event: string,
    handler: (event: { payload: unknown }) => void,
  ) => {
    handlers.set(event, handler);
    return Promise.resolve(() => {});
  }) as unknown as typeof listen;
  vi.mocked(listen).mockImplementation(capture);
  const { result } = mount();
  await waitFor(() => expect(handlers.has('scan-progress')).toBe(true));
  act(() => handlers.get('scan-progress')!({ payload: completed }));
  expect(result.current.completion?.phase).toBe('complete');
  await act(() => result.current.run(() => Promise.resolve()));
  expect(result.current.completion).toBeNull();
});
