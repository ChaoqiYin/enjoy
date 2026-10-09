import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HINT_MS, Hint } from './Hint';

function hint(onClose = vi.fn()) {
  return render(<Hint text="Copied" onClose={onClose} />);
}

function frame() {
  return screen.getByText('Copied').parentElement!;
}

afterEach(() => {
  // Unmount before handing the timers back: React Testing Library cannot
  // unmount a tree whose timers were swapped underneath it.
  cleanup();
  vi.useRealTimers();
});

it('takes a container of its own along the middle of the top edge', () => {
  hint();
  const hosts = document.querySelectorAll('[data-notification-host]');
  expect(hosts).toHaveLength(1);
  expect(hosts[0].getAttribute('data-notification-host')).toBe('center');
  expect(screen.getByText('Copied')).toBeTruthy();
});

it('says nothing to assistive technology and offers nothing to press', () => {
  hint();
  expect(frame().getAttribute('aria-hidden')).toBe('true');
  expect(frame().getAttribute('role')).toBeNull();
  expect(frame().querySelector('button')).toBeNull();
  // No countdown either: a line draining over a second is a flicker, not a
  // measure of how long is left.
  expect(frame().querySelector('[data-notice-countdown]')).toBeNull();
});

it('does not hand clicks through to whatever it covers', () => {
  hint();
  // jsdom has no hit testing, so this pins the intent rather than the pixels:
  // the hint holds clicks for the second it is up rather than passing them to
  // the control underneath that the user cannot see.
  expect(frame().className).not.toContain('pointer-events-none');
});

it('appears without an entrance of its own', () => {
  hint();
  // The second it is up is the second a borrowed entrance animation would spend
  // arriving, so the frame has none. jsdom runs no animation and computes no
  // styles, so what can be pinned here is that the frame asks for none; the
  // hint appearing as a whole rather than fading in is what a browser is
  // watched for.
  expect(frame().className).not.toMatch(/\banimate-/);
});

it('leaves on its own after the agreed time, and only once', () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  hint(onClose);
  vi.advanceTimersByTime(HINT_MS - 1);
  expect(onClose).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onClose).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(HINT_MS * 10);
  expect(onClose).toHaveBeenCalledOnce();
});
