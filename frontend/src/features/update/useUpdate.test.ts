import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useUpdate } from './useUpdate';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

type Handler = (event: { payload: unknown }) => void;

const { handlers, stop } = vi.hoisted(() => ({
  handlers: [] as Handler[],
  stop: vi.fn(),
}));

const available = {
  version: '0.2.0',
  currentVersion: '0.1.0',
  notes: 'Faster thumbnail generation.',
  date: '2026-09-01T00:00:00Z',
};

function emitProgress(payload: unknown) {
  act(() => {
    for (const handler of handlers) handler({ payload });
  });
}

beforeEach(() => {
  handlers.length = 0;
  stop.mockReset();
  vi.mocked(listen).mockImplementation(((_event: string, handler: Handler) => {
    handlers.push(handler);
    return Promise.resolve(stop);
  }) as never);
});

afterEach(() => vi.resetAllMocks());

it('keeps the startup check silent when it fails', async () => {
  // An offline machine must not raise a notice on every launch.
  vi.mocked(invoke).mockRejectedValue({
    code: 'update.check_failed',
    params: {},
    errorId: 'err_check',
  });
  const { result } = renderHook(() => useUpdate());
  act(() => result.current.startupCheck());
  await waitFor(() => expect(result.current.checking).toBe(false));
  expect(result.current.error).toBeNull();
  expect(result.current.check).toBeNull();
});

it('reports a check the user asked for', async () => {
  vi.mocked(invoke).mockRejectedValue({
    code: 'update.check_failed',
    params: {},
    errorId: 'err_check',
  });
  const { result } = renderHook(() => useUpdate());
  act(() => result.current.checkNow());
  await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.error?.errorId).toBe('err_check');
});

it('follows download progress and switches to ready', async () => {
  vi.mocked(invoke).mockResolvedValue({
    supported: true,
    currentVersion: '0.1.0',
    available,
    readyToRestart: false,
  });
  const { result } = renderHook(() => useUpdate());
  act(() => result.current.checkNow());
  await waitFor(() => expect(result.current.check).not.toBeNull());

  emitProgress({
    phase: 'downloading',
    downloaded: 512,
    total: 1024,
    version: '0.2.0',
  });
  await waitFor(() => expect(result.current.downloading).toBe(true));
  expect(result.current.progress?.downloaded).toBe(512);

  emitProgress({
    phase: 'ready',
    downloaded: 0,
    total: null,
    version: '0.2.0',
  });
  await waitFor(() => expect(result.current.check?.readyToRestart).toBe(true));
  expect(result.current.downloading).toBe(false);
  expect(result.current.progress).toBeNull();
});

it('restores the restart state when the app is still running', async () => {
  // Installing exits the process before answering, so a rejection that reaches
  // us means the restart did not happen — leaving the section on "restarting"
  // would hide that.
  vi.mocked(invoke).mockRejectedValue({
    code: 'update.blocked.scanning',
    params: {},
    errorId: 'err_scan',
  });
  const { result } = renderHook(() => useUpdate());
  act(() => result.current.restart());
  await waitFor(() => expect(result.current.restarting).toBe(false));
  expect(result.current.error?.code).toBe('update.blocked.scanning');
});

it('stops listening when it unmounts', async () => {
  const { unmount } = renderHook(() => useUpdate());
  await waitFor(() => expect(listen).toHaveBeenCalled());
  unmount();
  await waitFor(() => expect(stop).toHaveBeenCalled());
});
