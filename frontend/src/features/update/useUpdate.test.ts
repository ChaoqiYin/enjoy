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
  // The commands that answer with nothing — pausing, cancelling — resolve to
  // `undefined` in the real bridge too; a test that cares what one answered
  // queues its own value ahead of this.
  vi.mocked(invoke).mockResolvedValue(undefined as never);
  vi.mocked(listen).mockImplementation(((_event: string, handler: Handler) => {
    handlers.push(handler);
    return Promise.resolve(stop);
  }) as never);
});

afterEach(() => vi.resetAllMocks());

it('does not ask for an update until the user asks', async () => {
  // Nothing checks at launch: the settings button is the only trigger.
  const { result } = renderHook(() => useUpdate());
  // Drains the mount effects' microtasks, so a check deferred past mount
  // would still be caught here.
  await act(async () => {});
  expect(invoke).not.toHaveBeenCalled();
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

/** The check the settings button makes, then whatever the download answers. */
function offerThen(ended: unknown) {
  vi.mocked(invoke)
    .mockResolvedValueOnce({
      supported: true,
      currentVersion: '0.1.0',
      available,
      readyToRestart: false,
    })
    .mockResolvedValueOnce(ended);
}

it('follows download progress and settles on ready', async () => {
  offerThen({
    phase: 'ready',
    downloaded: 0,
    total: null,
    version: '0.2.0',
  });
  const { result } = renderHook(() => useUpdate());
  act(() => result.current.checkNow());
  await waitFor(() => expect(result.current.check).not.toBeNull());

  act(() => result.current.install());
  expect(result.current.downloading).toBe(true);
  emitProgress({
    phase: 'downloading',
    downloaded: 512,
    total: 1024,
    version: '0.2.0',
  });
  await waitFor(() => expect(result.current.progress?.downloaded).toBe(512));

  await waitFor(() => expect(result.current.check?.readyToRestart).toBe(true));
  expect(result.current.downloading).toBe(false);
  expect(result.current.paused).toBe(false);
  expect(result.current.progress).toBeNull();
});

it('keeps a paused download on screen with how far it got', async () => {
  // A paused download is one the user is coming back to, so the section stays
  // on it and the numbers stay with it.
  offerThen({
    phase: 'paused',
    downloaded: 700,
    total: 1024,
    version: '0.2.0',
  });
  const { result } = renderHook(() => useUpdate());
  act(() => result.current.checkNow());
  await waitFor(() => expect(result.current.check).not.toBeNull());

  act(() => result.current.install());
  await waitFor(() => expect(result.current.paused).toBe(true));
  expect(result.current.downloading).toBe(false);
  expect(result.current.progress?.downloaded).toBe(700);
  expect(result.current.check?.readyToRestart).toBe(false);
});

it('clears the progress a cancelled download had', async () => {
  offerThen({
    phase: 'cancelled',
    downloaded: 0,
    total: null,
    version: '0.2.0',
  });
  const { result } = renderHook(() => useUpdate());
  act(() => result.current.checkNow());
  await waitFor(() => expect(result.current.check).not.toBeNull());

  act(() => result.current.install());
  await waitFor(() => expect(result.current.downloading).toBe(false));
  expect(result.current.paused).toBe(false);
  expect(result.current.progress).toBeNull();
  expect(result.current.check?.readyToRestart).toBe(false);
});

it('asks the backend to pause without settling the download itself', async () => {
  // The transfer is still unwinding when this is pressed, so the section waits
  // for its answer rather than moving on by itself.
  const { result } = renderHook(() => useUpdate());
  act(() => result.current.pause());
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('control_update', { action: 'pause' }),
  );
  expect(result.current.paused).toBe(false);
});

it('leaves a running cancel to the transfer to answer', async () => {
  offerThen({
    phase: 'cancelled',
    downloaded: 0,
    total: null,
    version: '0.2.0',
  });
  const { result } = renderHook(() => useUpdate());
  act(() => result.current.checkNow());
  await waitFor(() => expect(result.current.check).not.toBeNull());
  act(() => result.current.install());
  expect(result.current.downloading).toBe(true);

  act(() => result.current.cancel());
  expect(result.current.downloading).toBe(true);
  await waitFor(() => expect(result.current.downloading).toBe(false));
});

it('dismisses a paused download as soon as it is cancelled', async () => {
  // Nothing is running to answer, so waiting for an ending that is not coming
  // would leave the section on a download the user has already thrown away.
  offerThen({
    phase: 'paused',
    downloaded: 700,
    total: 1024,
    version: '0.2.0',
  });
  const { result } = renderHook(() => useUpdate());
  act(() => result.current.checkNow());
  await waitFor(() => expect(result.current.check).not.toBeNull());
  act(() => result.current.install());
  await waitFor(() => expect(result.current.paused).toBe(true));

  act(() => result.current.cancel());
  expect(result.current.paused).toBe(false);
  expect(result.current.progress).toBeNull();
});

it('does not treat a progress event as a download that was never started', () => {
  // Progress is all the event carries now; a stray one cannot make the section
  // offer to pause a download that is not running.
  const { result } = renderHook(() => useUpdate());
  emitProgress({
    phase: 'downloading',
    downloaded: 512,
    total: 1024,
    version: '0.2.0',
  });
  expect(result.current.downloading).toBe(false);
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
