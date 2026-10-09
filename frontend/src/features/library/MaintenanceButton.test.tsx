import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { RefreshCw } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Video } from '../../shared/api';
import { video } from '../../test/fixtures';
import { MaintenanceButton } from './MaintenanceButton';

afterEach(cleanup);

const label = 'Regenerate thumbnail';

function maintenance({
  action = vi.fn(),
  disabled,
}: {
  action?: (video: Video) => void | Promise<unknown>;
  disabled?: boolean;
} = {}) {
  render(
    <MaintenanceButton
      video={video()}
      action={action}
      variant="secondary"
      icon={<RefreshCw size={14} aria-hidden="true" />}
      label={label}
      disabled={disabled}
    />,
  );
  return () => screen.getByRole('button', { name: label }) as HTMLButtonElement;
}

it('hands the video to the action, and wears the variant and size it was asked for', () => {
  const action = vi.fn();
  const control = maintenance({ action });
  expect(control().getAttribute('data-variant')).toBe('secondary');
  expect(control().getAttribute('data-size')).toBe('sm');
  fireEvent.click(control());
  expect(action).toHaveBeenCalledWith(video());
});

it('says it is running until the action answers, then stops saying it', async () => {
  let finish!: () => void;
  const control = maintenance({
    action: () =>
      new Promise<void>((done) => {
        finish = done;
      }),
  });
  fireEvent.click(control());
  expect(control().disabled).toBe(true);
  expect(control().querySelector('[data-slot="spinner"]')).toBeTruthy();
  await act(async () => finish());
  await waitFor(() => expect(control().disabled).toBe(false));
  expect(control().querySelector('[data-slot="spinner"]')).toBeNull();
});

it('stays out of the way when the caller has something running already', () => {
  const action = vi.fn();
  const control = maintenance({ action, disabled: true });
  expect(control().disabled).toBe(true);
  fireEvent.click(control());
  expect(action).not.toHaveBeenCalled();
});
