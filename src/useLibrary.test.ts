import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { libraryApi } from './api';
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
    changes: { added: 0, updated: 0, unavailable: 0 },
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
