// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import * as doubles from '../test/doubles';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TaskRow } from '../shared/api';
import english from '../../../shared/locales/en/common.json';
import { TasksPage } from './TasksPage';

const { list, action, onTaskChanged, setError } = vi.hoisted(() => ({
  list: vi.fn(),
  action: vi.fn(),
  onTaskChanged: vi.fn(),
  setError: vi.fn(),
}));

// The page is held to what it shows and what it asks of the kernel; the
// transport it asks through stands in, and so does the corner a failure lands
// in — which is a shared surface, not this page's own.
vi.mock('../shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../shared/api')>();
  return {
    ...original,
    taskApi: { list, action },
    backendEvents: { ...original.backendEvents, onTaskChanged },
  };
});
vi.mock('../features/library/useNotices', () => ({
  useNotices: () => ({ ...doubles.notices(), setError }),
}));
vi.mock('../features/library/useScan', () => ({
  useScan: () => doubles.scan(),
}));

// jsdom lays nothing out and implements no scrolling, which is what Radix
// reaches for when it brings the chosen option into view — and the same
// `:modal` cost the repository's own select tests pay for.
Element.prototype.scrollIntoView = vi.fn();
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english } },
    interpolation: { escapeValue: false },
  });
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

afterEach(cleanup);

let handlers: ((taskId: number) => void)[] = [];

function task(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 1,
    plugin: null,
    space_id: 1,
    space_name: 'Movies',
    video_id: 10,
    video_name: 'a.mkv',
    kind: 'move',
    state: 'running',
    pause_requested: false,
    cancel_requested: false,
    progress_current: null,
    progress_total: null,
    progress_label: null,
    attempts: 0,
    last_error: null,
    updated_at: 1_760_000_000_000,
    ...overrides,
  };
}

function page() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <TasksPage />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

/** Opens a filter by its trigger and presses one of its options. */
function pickOption(triggerName: string, optionName: string) {
  fireEvent.click(screen.getByRole('combobox', { name: triggerName }));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}

it('shows what the kernel has, one row per task', async () => {
  list.mockResolvedValue([
    task({ id: 1, space_name: 'Family', video_name: 'holiday.mp4' }),
  ]);
  page();
  expect(await screen.findByText('Family · holiday.mp4')).toBeTruthy();
});

it('narrows by source without asking the kernel again', async () => {
  list.mockResolvedValue([
    task({ id: 1, plugin: null, video_name: 'kernel-task.mkv' }),
    task({ id: 2, plugin: 'my-plugin', video_name: 'plugin-task.mkv' }),
  ]);
  page();
  await screen.findByText('Movies · kernel-task.mkv');
  await screen.findByText('Movies · plugin-task.mkv');
  pickOption('Source', 'my-plugin');
  expect(screen.queryByText('Movies · kernel-task.mkv')).toBeNull();
  expect(screen.getByText('Movies · plugin-task.mkv')).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(1);
});

it('narrows by state', async () => {
  list.mockResolvedValue([
    task({ id: 1, state: 'running', video_name: 'under-way.mkv' }),
    task({ id: 2, state: 'done', video_name: 'finished.mkv' }),
  ]);
  page();
  await screen.findByText('Movies · under-way.mkv');
  await screen.findByText('Movies · finished.mkv');
  pickOption('State', english.taskStateDone);
  expect(screen.queryByText('Movies · under-way.mkv')).toBeNull();
  expect(screen.getByText('Movies · finished.mkv')).toBeTruthy();
});

it('asks the kernel for the action whose button was pressed', async () => {
  list.mockResolvedValue([task({ id: 7, state: 'running' })]);
  page();
  const pause = await screen.findByRole('button', { name: english.pause });
  fireEvent.click(pause);
  await waitFor(() => expect(action).toHaveBeenCalledWith(7, 'pause'));
});

it('lands a failed action in the notices', async () => {
  list.mockResolvedValue([task({ id: 7, state: 'running' })]);
  action.mockRejectedValue({
    code: 'task.invalid_action',
    params: {},
    errorId: 'err_action',
  });
  page();
  const pause = await screen.findByRole('button', { name: english.pause });
  fireEvent.click(pause);
  await waitFor(() =>
    expect(setError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'task.invalid_action' }),
    ),
  );
});

it('has words rather than a blank page when there are no tasks', async () => {
  list.mockResolvedValue([]);
  page();
  expect(
    await screen.findByRole('heading', { name: english.tasksEmpty }),
  ).toBeTruthy();
});

it('picks up a change the backend announces, without polling', async () => {
  list.mockResolvedValue([task({ id: 1, video_name: 'before.mkv' })]);
  page();
  await screen.findByText('Movies · before.mkv');
  expect(handlers).toHaveLength(1);

  list.mockResolvedValue([
    task({ id: 1, video_name: 'before.mkv' }),
    task({ id: 2, video_name: 'after.mkv' }),
  ]);
  await act(async () => {
    for (const handler of handlers) handler(2);
  });
  expect(await screen.findByText('Movies · after.mkv')).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(2);
});
