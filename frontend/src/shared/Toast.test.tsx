import {
  act,
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

// The countdown is the first thing in this repo to need fake timers, so the
// pairing is stated once here: unmount everything first, because React Testing
// Library cannot clean up a tree whose timers have already been swapped back.
// Note also that a notice must be driven with `focusin`/`focusout` and
// `mouseover`/`mouseout` — React wires `onFocus`/`onBlur` only to the former
// pair and synthesises `onMouseEnter`/`onMouseLeave` from the latter, so
// `focus`, `blur`, `mouseEnter` and `mouseLeave` would silently do nothing.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

function renderCountdown(
  onClose: () => void,
  autoCloseMs?: number,
  children?: ReactNode,
) {
  return render(
    <Toast
      type="success"
      closeLabel="Close"
      onClose={onClose}
      autoCloseMs={autoCloseMs}
    >
      {children ?? <p>Scan complete</p>}
    </Toast>,
  );
}

it('closes itself when the given time is up, and only once', () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  renderCountdown(onClose, 3000);
  act(() => vi.advanceTimersByTime(2900));
  expect(onClose).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(100));
  expect(onClose).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(60000));
  expect(onClose).toHaveBeenCalledOnce();
});

it('stays put when no time is given, with no progress to show', () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  renderCountdown(onClose);
  act(() => vi.advanceTimersByTime(60000));
  expect(onClose).not.toHaveBeenCalled();
  expect(document.querySelector('progress')).toBeNull();
});

it('shows a progress bar that shrinks with the time left and stays silent', () => {
  vi.useFakeTimers();
  renderCountdown(vi.fn(), 3000);
  const bar = document.querySelector('progress')!;
  expect(bar.getAttribute('aria-hidden')).toBe('true');
  expect(bar.getAttribute('max')).toBe('3000');
  expect(bar.getAttribute('value')).toBe('3000');
  expect(bar.classList.contains('progress-success')).toBe(true);
  act(() => vi.advanceTimersByTime(1000));
  expect(bar.getAttribute('value')).toBe('2000');
});

it('holds the countdown while hovered and picks it up where it stopped', () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  renderCountdown(onClose, 3000);
  const notice = screen.getByRole('status');
  act(() => vi.advanceTimersByTime(1000));
  fireEvent.mouseOver(notice);
  act(() => vi.advanceTimersByTime(10000));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.mouseOut(notice);
  act(() => vi.advanceTimersByTime(1900));
  expect(onClose).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(200));
  expect(onClose).toHaveBeenCalledOnce();
});

it('holds the countdown while focus is inside and releases it on leaving', () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  renderCountdown(onClose, 3000, <button type="button">Details</button>);
  const details = screen.getByRole('button', { name: 'Details' });
  const closeButton = screen.getByRole('button', { name: 'Close' });
  fireEvent.focusIn(details);
  act(() => vi.advanceTimersByTime(10000));
  expect(onClose).not.toHaveBeenCalled();
  // Moving between the notice's own controls is not leaving the notice.
  fireEvent.focusOut(details, { relatedTarget: closeButton });
  fireEvent.focusIn(closeButton, { relatedTarget: details });
  act(() => vi.advanceTimersByTime(10000));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.focusOut(closeButton, { relatedTarget: document.body });
  act(() => vi.advanceTimersByTime(3000));
  expect(onClose).toHaveBeenCalledOnce();
});

it('closes the previous non-error notice when a newer one appears', () => {
  const replaced = vi.fn();
  const latest = vi.fn();
  const first = render(
    <Toast type="success" closeLabel="Close" onClose={replaced}>
      <p>First scan</p>
    </Toast>,
  );
  const second = render(
    <Toast type="info" closeLabel="Close" onClose={latest}>
      <p>Second scan</p>
    </Toast>,
  );
  expect(replaced).toHaveBeenCalledOnce();
  expect(latest).not.toHaveBeenCalled();
  expect(screen.getByText('Second scan')).toBeTruthy();
  first.unmount();
  second.unmount();
});

it('leaves errors out of the rotation in both directions', () => {
  const firstError = vi.fn();
  const secondError = vi.fn();
  const previousError = render(
    <Toast type="error" closeLabel="Close" onClose={firstError}>
      <p>Copy failed</p>
    </Toast>,
  );
  const anotherError = render(
    <Toast type="error" closeLabel="Close" onClose={secondError}>
      <p>Index removal failed</p>
    </Toast>,
  );
  renderCountdown(vi.fn());
  expect(firstError).not.toHaveBeenCalled();
  expect(secondError).not.toHaveBeenCalled();
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  previousError.unmount();
  anotherError.unmount();
});

it('gives a notice replacing its own slot the full time, without closing it', () => {
  vi.useFakeTimers();
  const replaced = vi.fn();
  const latest = vi.fn();
  const { rerender } = render(
    <Toast
      key="first"
      type="success"
      closeLabel="Close"
      onClose={replaced}
      autoCloseMs={3000}
    >
      <p>First scan</p>
    </Toast>,
  );
  act(() => vi.advanceTimersByTime(2500));
  // Replacing a slot's content remounts its notice — the owner clears the slot
  // before refilling it — so the two keys stand in for that unmount and mount
  // arriving in a single commit.
  rerender(
    <Toast
      key="second"
      type="success"
      closeLabel="Close"
      onClose={latest}
      autoCloseMs={3000}
    >
      <p>Second scan</p>
    </Toast>,
  );
  // Closing "the old notice" here would call the slot's own close callback,
  // which clears the slot unconditionally — wiping the content just written.
  // The countdown starting over is what gives the second notice its full time.
  expect(replaced).not.toHaveBeenCalled();
  expect(screen.getByText('Second scan')).toBeTruthy();
  act(() => vi.advanceTimersByTime(2900));
  expect(latest).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(200));
  expect(latest).toHaveBeenCalledOnce();
});
