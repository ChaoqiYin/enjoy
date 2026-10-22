import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TaskRow } from '../../shared/api';
import english from '../../../../shared/locales/en/common.json';
import { TaskTable } from './TaskTable';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english } },
    interpolation: { escapeValue: false },
  });
});

afterEach(cleanup);

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

function table(tasks: TaskRow[]) {
  const onAction = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <TaskTable tasks={tasks} onAction={onAction} />
    </I18nextProvider>,
  );
  return onAction;
}

it('names the space a task belongs to, so two spaces never read as one', () => {
  table([task({ space_name: 'Family', video_name: 'holiday.mp4' })]);
  expect(screen.getByText('Family · holiday.mp4')).toBeTruthy();
});

it('says all videos for a task that is not about one video', () => {
  table([task({ video_id: null, video_name: null })]);
  expect(screen.getByText(`Movies · ${english.taskAllVideos}`)).toBeTruthy();
});

it('says which side of the seam a task came from', () => {
  table([task({ id: 1, plugin: null }), task({ id: 2, plugin: 'my-plugin' })]);
  expect(screen.getAllByText(english.taskSourceKernel)).toHaveLength(1);
  expect(screen.getAllByText('my-plugin')).toHaveLength(1);
});

it('shows the state as the user reads it, not only as it is stored', () => {
  table([
    task({ id: 1, state: 'running', pause_requested: true }),
    task({ id: 2, state: 'running', cancel_requested: true }),
    task({ id: 3, state: 'done' }),
  ]);
  expect(screen.getByText(english.taskPausing)).toBeTruthy();
  expect(screen.getByText(english.taskCancelling)).toBeTruthy();
  expect(screen.getByText(english.taskStateDone)).toBeTruthy();
});

it('writes progress as current over total, or as the label alone', () => {
  table([
    task({
      id: 1,
      progress_current: 3,
      progress_total: 10,
      progress_label: 'files',
      last_error: 'e1',
    }),
    task({
      id: 2,
      progress_current: 4,
      progress_total: null,
      progress_label: null,
      last_error: 'e2',
    }),
    task({
      id: 3,
      progress_current: null,
      progress_total: null,
      progress_label: null,
      last_error: 'e3',
    }),
  ]);
  expect(screen.getByText('3/10 files')).toBeTruthy();
  expect(screen.getByText('4')).toBeTruthy();
  expect(screen.getByText('-')).toBeTruthy();
});

it('renders the updated time the way the locale dates it', () => {
  const stamp = Date.UTC(2026, 0, 15, 8, 30);
  table([task({ updated_at: stamp })]);
  const expected = new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(stamp));
  expect(screen.getByText(expected)).toBeTruthy();
});

it('offers only the actions the task can take', () => {
  table([
    task({ id: 1, state: 'pending' }),
    task({ id: 2, state: 'running' }),
    task({ id: 3, state: 'running', pause_requested: true }),
    task({ id: 4, state: 'paused' }),
    task({ id: 5, state: 'failed' }),
    task({ id: 6, state: 'done' }),
  ]);
  // Pending: pause it, or stop it. Stopping is open to every task that is
  // still under way — including one whose pause has already been asked for.
  expect(screen.getAllByRole('button', { name: english.pause })).toHaveLength(
    2,
  );
  expect(screen.getAllByRole('button', { name: english.cancel })).toHaveLength(
    4,
  );
  // A pause already asked for cannot be asked again — but it can be taken
  // back, and the way to take it back is the same word that gets a paused
  // task going again.
  const row3 = screen.getByText(english.taskPausing).closest('tr')!;
  expect(row3.querySelector(`[aria-label="${english.pause}"]`)).toBeNull();
  expect(row3.querySelector(`[aria-label="${english.resume}"]`)).toBeTruthy();
  // Paused: the one way out other than cancelling.
  expect(screen.getAllByRole('button', { name: english.resume })).toHaveLength(
    2,
  );
  // Failed: try again, and nothing else.
  const row5 = screen.getByText(english.taskStateFailed).closest('tr')!;
  expect(row5.querySelector(`[aria-label="${english.retry}"]`)).toBeTruthy();
  expect(row5.querySelector(`[aria-label="${english.cancel}"]`)).toBeNull();
  // Finished tasks are not steered any more.
  const row6 = screen.getByText(english.taskStateDone).closest('tr')!;
  expect(row6.querySelectorAll('button')).toHaveLength(0);
});

it('hands the pressed action up, and gives every action a name and a prompt', () => {
  const onAction = table([task({ id: 42, state: 'running' })]);
  const pause = screen.getByRole('button', { name: english.pause });
  expect(pause.closest('[data-slot="tooltip-anchor"]')).toBeTruthy();
  fireEvent.click(pause);
  expect(onAction).toHaveBeenCalledWith(42, 'pause');
  const cancel = screen.getAllByRole('button', { name: english.cancel })[0];
  fireEvent.click(cancel);
  expect(onAction).toHaveBeenCalledWith(42, 'cancel');
});

it('has words rather than a blank page when nothing is to show', () => {
  table([]);
  expect(
    screen.getByRole('heading', { name: english.tasksEmpty }),
  ).toBeTruthy();
  expect(screen.getByText(english.tasksEmptyMessage)).toBeTruthy();
});
