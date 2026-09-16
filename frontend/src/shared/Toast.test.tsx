import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { Toast } from './Toast';
import type { ToastType } from './Toast';

afterEach(cleanup);

function renderToast(type: ToastType, children?: ReactNode) {
  return render(
    <Toast type={type} closeLabel="Close" onClose={vi.fn()}>
      {children ?? <p>{type} body</p>}
    </Toast>,
  );
}

it('renders outside the page layout and preserves the close action', () => {
  const onClose = vi.fn();
  const { container, unmount } = render(
    <main>
      <Toast type="error" closeLabel="Close" onClose={onClose}>
        <h3 className="font-bold">Operation failed</h3>
        <p>The directory could not be scanned.</p>
      </Toast>
    </main>,
  );
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(
    screen.getByRole('heading', { name: 'Operation failed' }),
  ).toBeTruthy();
  const host = screen.getByRole('alert').parentElement!;
  expect(host.classList.contains('toast')).toBe(true);
  expect(host.parentElement).toBe(document.body);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledOnce();
  unmount();
  expect(document.querySelector('[data-notification-host]')).toBeNull();
});

it('announces errors assertively and the other types politely', () => {
  renderToast('success');
  renderToast('info');
  renderToast('warning');
  renderToast('error');
  expect(screen.getAllByRole('status')).toHaveLength(3);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
});

it('takes its colours from the native alert type', () => {
  for (const type of ['success', 'error', 'info', 'warning'] as ToastType[]) {
    const { unmount } = renderToast(type);
    const notice = screen.getByRole(type === 'error' ? 'alert' : 'status');
    expect(notice.classList.contains('alert')).toBe(true);
    expect(notice.classList.contains('alert-soft')).toBe(true);
    expect(notice.classList.contains(`alert-${type}`)).toBe(true);
    unmount();
  }
});

it('hides the type icon from assistive technology', () => {
  renderToast('success');
  const icon = screen.getByRole('status').querySelector('svg')!;
  expect(icon.getAttribute('aria-hidden')).toBe('true');
});

it('renders caller-supplied content and actions', () => {
  const onRetry = vi.fn();
  renderToast(
    'error',
    <>
      <h3 className="font-bold">Operation failed</h3>
      <p>Reference: example</p>
      <button onClick={onRetry}>Retry</button>
    </>,
  );
  expect(screen.getByText('Reference: example')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRetry).toHaveBeenCalledOnce();
});

it('stacks simultaneous errors in one shared notification container', () => {
  const first = renderToast('error');
  const second = renderToast('error');
  expect(document.querySelectorAll('[data-notification-host]')).toHaveLength(1);
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  first.unmount();
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  second.unmount();
  expect(document.querySelector('[data-notification-host]')).toBeNull();
});

it('keeps notices above an open dialog and restores their host after closing', async () => {
  const { container } = render(
    <>
      <dialog open />
      <Toast type="error" closeLabel="Close" onClose={vi.fn()}>
        <p>Operation failed</p>
      </Toast>
    </>,
  );
  const dialog = container.querySelector('dialog')!;
  const host = screen.getByRole('alert').parentElement!;
  expect(host.parentElement).toBe(dialog);
  dialog.removeAttribute('open');
  await waitFor(() => expect(host.parentElement).toBe(document.body));
});
