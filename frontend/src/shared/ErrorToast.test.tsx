import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ErrorToast } from './ErrorToast';

const props = {
  title: 'Operation failed',
  description: 'The directory could not be scanned.',
  reference: 'Reference: example',
  retryLabel: 'Retry',
  closeLabel: 'Close',
};
afterEach(cleanup);

it('renders title and description outside page layout and preserves actions', () => {
  const onRetry = vi.fn();
  const onClose = vi.fn();
  const { container, unmount } = render(
    <main>
      <ErrorToast {...props} onRetry={onRetry} onClose={onClose} />
    </main>,
  );
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(screen.getByRole('heading', { name: props.title })).toBeTruthy();
  expect(screen.getByText(props.description)).toBeTruthy();
  const host = screen.getByRole('alert').parentElement!;
  expect(host.classList.contains('toast')).toBe(true);
  expect(host.parentElement).toBe(document.body);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onRetry).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
  unmount();
  expect(document.querySelector('[data-notification-host]')).toBeNull();
});
it('stacks simultaneous errors in one shared notification container', () => {
  const first = render(<ErrorToast {...props} onClose={vi.fn()} />);
  const second = render(
    <ErrorToast
      {...props}
      description="Language could not be saved."
      onClose={vi.fn()}
    />,
  );
  expect(document.querySelectorAll('[data-notification-host]')).toHaveLength(1);
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  first.unmount();
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  second.unmount();
  expect(document.querySelector('[data-notification-host]')).toBeNull();
});
it('keeps notifications above an open dialog and restores their host after closing', async () => {
  const { container } = render(
    <>
      <dialog open />
      <ErrorToast {...props} onClose={vi.fn()} />
    </>,
  );
  const dialog = container.querySelector('dialog')!;
  const host = screen.getByRole('alert').parentElement!;
  expect(host.parentElement).toBe(dialog);
  dialog.removeAttribute('open');
  await waitFor(() => expect(host.parentElement).toBe(document.body));
});
