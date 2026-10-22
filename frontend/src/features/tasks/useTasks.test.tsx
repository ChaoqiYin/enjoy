import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { task } from '../../test/fixtures';
import { useTasks } from './useTasks';

const { list, action, onTaskChanged, setError } = vi.hoisted(() => ({
  list: vi.fn(),
  action: vi.fn(),
  onTaskChanged: vi.fn(),
  setError: vi.fn(),
}));

vi.mock('../../shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/api')>()),
  taskApi: { list, action },
  backendEvents: {
    ...(await importOriginal<typeof import('../../shared/api')>())
      .backendEvents,
    onTaskChanged,
  },
}));

// What this hook asks of the library is one thing: the corner a failed
// command lands in. Everything else about the notices belongs to the page.
vi.mock('../library/useNotices', () => ({
  useNotices: () => ({ setError }),
}));

/** The handlers the hook subscribed with, newest registration last. */
let handlers: ((taskId: number) => void)[] = [];

function renderTasks() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useTasks(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

/** Fires one `task-changed` event, as the backend would. */
function emitChange(taskId: number) {
  act(() => {
    for (const handler of handlers) handler(taskId);
  });
}

beforeEach(() => {
  handlers = [];
  onTaskChanged.mockReset();
  onTaskChanged.mockImplementation(
    (handler: (taskId: number) => void): Promise<() => void> => {
      handlers.push(handler);
      return Promise.resolve(() => {
        handlers = handlers.filter((other) => other !== handler);
      });
    },
  );
  list.mockReset();
  action.mockReset();
  action.mockResolvedValue(undefined);
  setError.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

it('asks the kernel for the task list as soon as it mounts', async () => {
  list.mockResolvedValue([task()]);
  const { result } = renderTasks();
  await waitFor(() => expect(result.current.tasks).toHaveLength(1));
  expect(list).toHaveBeenCalledTimes(1);
});

it('re-queries the moment the backend says a task changed', async () => {
  list.mockResolvedValue([task()]);
  renderTasks();
  await waitFor(() => expect(handlers).toHaveLength(1));
  list.mockResolvedValue([task({ id: 2 })]);
  emitChange(2);
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
});

it('merges a burst of change events into one re-query after 500ms', async () => {
  vi.useFakeTimers();
  list.mockResolvedValue([task()]);
  renderTasks();
  // Drains the mount effects' microtasks: the subscription above is settled
  // and the first listing resolved, all before any clock runs.
  await act(async () => {});
  expect(list).toHaveBeenCalledTimes(1);

  // The first event answers immediately and opens the throttle window.
  await act(async () => {
    handlers[0](1);
  });
  expect(list).toHaveBeenCalledTimes(2);

  // Events inside the window are held back rather than answered one by one.
  await act(async () => {
    handlers[0](2);
    handlers[0](3);
  });
  expect(list).toHaveBeenCalledTimes(2);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(list).toHaveBeenCalledTimes(3);
});

it('runs the action it is given, then refreshes the list', async () => {
  list.mockResolvedValue([task()]);
  const { result } = renderTasks();
  await act(async () => {});
  await act(async () => {
    await result.current.act(7, 'pause');
  });
  expect(action).toHaveBeenCalledWith(7, 'pause');
  expect(list).toHaveBeenCalledTimes(2);
});

it('reports a failed action through the notices rather than throwing', async () => {
  list.mockResolvedValue([task()]);
  action.mockRejectedValue({
    code: 'task.invalid_action',
    params: {},
    errorId: 'err_action',
  });
  const { result } = renderTasks();
  await act(async () => {});
  await act(async () => {
    await result.current.act(7, 'retry');
  });
  expect(setError).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'task.invalid_action' }),
  );
  // A command that did not happen is not a reason to redraw the listing.
  expect(list).toHaveBeenCalledTimes(1);
});

it('surfaces a listing that could not be read', async () => {
  list.mockRejectedValue({
    code: 'task.list_failed',
    params: {},
    errorId: 'err_list',
  });
  const { result } = renderTasks();
  await waitFor(() =>
    expect(setError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'task.list_failed' }),
    ),
  );
  expect(result.current.tasks).toEqual([]);
});
