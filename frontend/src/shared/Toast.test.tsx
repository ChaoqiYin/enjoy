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
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms per call; Radix asks the page behind a dialog whether it
// sits in the top layer whenever it hides it. Nothing here is a top-layer
// element, so answering `false` outright is both correct and instant. The Radix
// dialog below names its close button through a tooltip, and the tooltip's
// panel is a second set of nodes for Radix's observer to walk — without the
// shim that walk runs long enough to time the panel test out. The same shim,
// for the same reason, sits in `AddDirectories.test.tsx`.
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

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

/** Which `Alert` variant each notice type wears. The table is written out here
 *  rather than read from `Toast` so that a notice that lost its colour — the
 *  failure the full-literal rule exists to prevent — is a failing test rather
 *  than a test that agrees with whatever the component happens to say. */
const variants: Record<ToastType, string> = {
  success: 'success',
  error: 'destructive',
  info: 'info',
  warning: 'warning',
};

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
  // The notice goes into the shared host for notices at the end of the top
  // edge, which is what places it and what holds several of them together.
  const host = document.querySelector<HTMLElement>(
    '[data-notification-host="end"]',
  )!;
  expect(host.contains(screen.getByRole('alert'))).toBe(true);
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

it('takes its colours from the alert variant its type names', () => {
  for (const type of ['success', 'error', 'info', 'warning'] as ToastType[]) {
    const { unmount } = renderToast(type);
    const notice = screen.getByRole(type === 'error' ? 'alert' : 'status');
    // The colour is the carrier's, not a class built from the type: a written
    // out variant per type is what keeps Tailwind generating it, and reading it
    // back off `data-variant` is reading the contract rather than the rule that
    // happens to paint it today.
    expect(notice.getAttribute('data-slot')).toBe('alert');
    expect(notice.getAttribute('data-variant')).toBe(variants[type]);
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

it('keeps notices above a modal dialog that is not a native `<dialog>`', async () => {
  // The scan-progress panel is a native `<dialog open>`; every other overlay in
  // the application is Radix's, and Radix portals its panel to `body` rather
  // than to a `<dialog>` element. Both kinds have to be found, or a notice
  // raised while a drawer is open lands behind it.
  function view({ open }: { open: boolean }) {
    return (
      <>
        <Dialog open={open}>
          <DialogContent closeLabel="Close">
            <DialogTitle>Question</DialogTitle>
          </DialogContent>
        </Dialog>
        <Toast type="error" closeLabel="Close" onClose={vi.fn()}>
          <p>Operation failed</p>
        </Toast>
      </>
    );
  }
  const { rerender } = render(view({ open: true }));
  const host = document.querySelector<HTMLElement>('[data-notification-host]')!;
  const panel = await screen.findByRole('dialog');
  await waitFor(() => expect(host.parentElement).toBe(panel));
  rerender(view({ open: false }));
  // The panel and the host inside it leave the document together, so the host
  // is put back at the root rather than left detached with the portal.
  await waitFor(() => expect(host.parentElement).toBe(document.body));
});

it('moves into a native dialog while it is open and back out when it closes', async () => {
  function view({ open }: { open: boolean }) {
    return (
      <>
        {open && <dialog open />}
        <Toast type="error" closeLabel="Close" onClose={vi.fn()}>
          <p>Operation failed</p>
        </Toast>
      </>
    );
  }
  const { rerender } = render(view({ open: true }));
  const host = document.querySelector<HTMLElement>('[data-notification-host]')!;
  const dialog = document.querySelector('dialog')!;
  await waitFor(() => expect(host.parentElement).toBe(dialog));
  rerender(view({ open: false }));
  await waitFor(() => expect(host.parentElement).toBe(document.body));
});

it('turns to the dialog the drawer opens, not the one behind it', async () => {
  // The last opened overlay is the last one in the document, and a notice
  // belongs to the one on top of the stack rather than to the page.
  function View({ drawer }: { drawer: boolean }) {
    return (
      <>
        <dialog open data-name="behind" />
        {drawer && (
          <div>
            <dialog open data-name="front" />
          </div>
        )}
        <Toast type="info" closeLabel="Close" onClose={vi.fn()}>
          <p>Copied</p>
        </Toast>
      </>
    );
  }
  const { rerender } = render(<View drawer={false} />);
  const host = document.querySelector<HTMLElement>('[data-notification-host]')!;
  await waitFor(() =>
    expect(host.parentElement?.getAttribute('data-name')).toBe('behind'),
  );
  rerender(<View drawer={true} />);
  await waitFor(() =>
    expect(host.parentElement?.getAttribute('data-name')).toBe('front'),
  );
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

it('stays put when no time is given, with no countdown to show', () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  renderCountdown(onClose);
  act(() => vi.advanceTimersByTime(60000));
  expect(onClose).not.toHaveBeenCalled();
  expect(document.querySelector('[data-notice-countdown]')).toBeNull();
});

it('drains a countdown along the frame without announcing itself', () => {
  vi.useFakeTimers();
  renderCountdown(vi.fn(), 3000);
  const drain = document.querySelector<HTMLElement>('[data-notice-countdown]')!;
  // Silenced on purpose: an exposed countdown makes a screen reader report
  // every step of a timer the user never asked to hear.
  expect(drain.closest('[aria-hidden="true"]')).toBeTruthy();
  // It draws itself in the frame's own foreground rather than a tone class. A
  // tone-coloured fill would take the very colour the frame is already made of
  // and disappear into it.
  expect(drain.classList.contains('bg-current')).toBe(true);
  expect(drain.closest('[role="progressbar"]')).toBeNull();
  // The line is drawn at its full width and scaled down over the notice's
  // remaining time, so it never steps: nothing rewrites it between the start
  // and the end. jsdom runs no animation, so what is pinned here is the
  // declaration the engine animates — that the line then moves smoothly is the
  // engine's part of the bargain, which no test in this environment can see.
  expect(drain.classList.contains('w-full')).toBe(true);
  expect(drain.classList.contains('origin-left')).toBe(true);
  expect(drain.style.animationName).toBe('notice-countdown');
  expect(drain.style.animationDuration).toBe('3000ms');
  expect(drain.style.animationTimingFunction).toBe('linear');
  // Without `forwards` the line would spring back to full for the moment
  // between the time running out and the notice leaving.
  expect(drain.style.animationFillMode).toBe('forwards');
  expect(drain.style.animationPlayState).toBe('running');
  const declared = drain.getAttribute('style');
  act(() => vi.advanceTimersByTime(1000));
  expect(drain.getAttribute('style')).toBe(declared);
});

it('holds the countdown while hovered and picks it up where it stopped', () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  renderCountdown(onClose, 3000);
  const notice = screen.getByRole('status');
  const drain = document.querySelector<HTMLElement>('[data-notice-countdown]')!;
  act(() => vi.advanceTimersByTime(1000));
  fireEvent.mouseOver(notice);
  // The line is held where it stands, not redrawn: a paused animation keeps its
  // own progress, so releasing it continues from the time that was left. The
  // same element at the same duration is what makes that true — replacing the
  // element, or shortening its duration, is how the line would silently start
  // over instead.
  expect(drain.style.animationPlayState).toBe('paused');
  expect(document.querySelector('[data-notice-countdown]')).toBe(drain);
  expect(drain.style.animationDuration).toBe('3000ms');
  act(() => vi.advanceTimersByTime(10000));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.mouseOut(notice);
  expect(drain.style.animationPlayState).toBe('running');
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
  const drain = document.querySelector<HTMLElement>('[data-notice-countdown]')!;
  fireEvent.focusIn(details);
  // Keyboard focus holds the line itself, not only the clock behind it.
  expect(drain.style.animationPlayState).toBe('paused');
  act(() => vi.advanceTimersByTime(10000));
  expect(onClose).not.toHaveBeenCalled();
  // Moving between the notice's own controls is not leaving the notice.
  fireEvent.focusOut(details, { relatedTarget: closeButton });
  fireEvent.focusIn(closeButton, { relatedTarget: details });
  act(() => vi.advanceTimersByTime(10000));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.focusOut(closeButton, { relatedTarget: document.body });
  expect(drain.style.animationPlayState).toBe('running');
  act(() => vi.advanceTimersByTime(3000));
  expect(onClose).toHaveBeenCalledOnce();
});

it('carries the same line on when the same notice reports again', () => {
  vi.useFakeTimers();
  const reported = vi.fn();
  const latest = vi.fn();
  const { rerender } = render(
    <Toast
      type="success"
      closeLabel="Close"
      onClose={reported}
      autoCloseMs={3000}
    >
      <p>Scan complete</p>
    </Toast>,
  );
  const drain = document.querySelector<HTMLElement>('[data-notice-countdown]')!;
  act(() => vi.advanceTimersByTime(1000));
  // A scan publishes its completion twice, and the second one lands in the same
  // slot without remounting the notice. Both describe the same scan, so it is
  // the same three seconds: the line carries on where it was instead of
  // restarting, which would leave it a tenth of the way short of the notice's
  // own lifetime.
  rerender(
    <Toast
      type="success"
      closeLabel="Close"
      onClose={latest}
      autoCloseMs={3000}
    >
      <p>Scan complete</p>
    </Toast>,
  );
  expect(document.querySelector('[data-notice-countdown]')).toBe(drain);
  act(() => vi.advanceTimersByTime(1900));
  expect(latest).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(200));
  expect(latest).toHaveBeenCalledOnce();
});

it('starts the line over when the same slot reports a different time', () => {
  vi.useFakeTimers();
  const latest = vi.fn();
  const { rerender } = render(
    <Toast
      type="success"
      closeLabel="Close"
      onClose={vi.fn()}
      autoCloseMs={3000}
    >
      <p>Scan complete</p>
    </Toast>,
  );
  const drain = document.querySelector<HTMLElement>('[data-notice-countdown]')!;
  act(() => vi.advanceTimersByTime(2000));
  // A different time is a different notice in the same slot, so it gets its own
  // line: a fresh element, whose animation starts at the beginning, rather than
  // the old line retimed part of the way through.
  rerender(
    <Toast
      type="success"
      closeLabel="Close"
      onClose={latest}
      autoCloseMs={5000}
    >
      <p>Scan complete</p>
    </Toast>,
  );
  const replaced = document.querySelector<HTMLElement>(
    '[data-notice-countdown]',
  )!;
  expect(replaced).not.toBe(drain);
  expect(replaced.style.animationDuration).toBe('5000ms');
  act(() => vi.advanceTimersByTime(4900));
  expect(latest).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(200));
  expect(latest).toHaveBeenCalledOnce();
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
