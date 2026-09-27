import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCommand } from './useCommand';

const failed = { code: 'settings.save.failed', params: {}, errorId: 'err_1' };

describe('one command', () => {
  it('is busy while it runs, and not once it has finished', async () => {
    const { result } = renderHook(() => useCommand<string>());
    let finish: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let running: Promise<void> = Promise.resolve();

    await act(async () => {
      running = result.current.run('dark', () => held);
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.failure).toBeNull();

    await act(async () => {
      finish();
      await running;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.failure).toBeNull();
  });

  it('keeps the value the command was attempted with, so a retry repeats it', async () => {
    const { result } = renderHook(() => useCommand<string>());

    // Not the value that is selected now: the retry repeats the one that
    // failed, which is why the two travel together.
    await act(() => result.current.run('dark', () => Promise.reject(failed)));

    expect(result.current.busy).toBe(false);
    expect(result.current.failure?.value).toBe('dark');
    expect(result.current.failure?.error.errorId).toBe('err_1');
  });

  it('lets go of the failure when it is dismissed, and when another run starts', async () => {
    const { result } = renderHook(() => useCommand<string>());
    await act(() => result.current.run('dark', () => Promise.reject(failed)));
    act(() => result.current.dismissFailure());
    expect(result.current.failure).toBeNull();

    await act(() => result.current.run('dark', () => Promise.reject(failed)));
    let finish: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    await act(async () => {
      const running = result.current.run('light', () => held);
      finish();
      await running;
    });
    // Cleared as the second attempt starts rather than only when it ends: the
    // failure on screen would otherwise be the first one's until the second
    // finished.
    expect(result.current.failure).toBeNull();
  });

  it('hands the failure over instead of holding it when the caller says where it goes', async () => {
    const sink = vi.fn();
    const { result } = renderHook(() => useCommand(sink));

    await act(() =>
      result.current.run(undefined, () => Promise.reject(failed)),
    );

    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ errorId: 'err_1' }),
    );
    expect(result.current.failure).toBeNull();
  });

  it('runs the rest of the action only if the command itself got through', async () => {
    const { result } = renderHook(() => useCommand<string>());
    const after = vi.fn();

    await act(() =>
      result.current.run('dark', async () => {
        await Promise.reject(failed);
        after();
      }),
    );

    // What `run` promises: an action that throws is an action that stopped
    // there, so the step after the await is not reached and the caller has the
    // failure to show rather than a half-done change.
    expect(after).not.toHaveBeenCalled();
    expect(result.current.failure).not.toBeNull();
  });
});
