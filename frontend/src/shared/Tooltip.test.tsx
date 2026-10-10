import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Tooltip } from './Tooltip';

afterEach(cleanup);

function play() {
  return render(
    <Tooltip text="Play the video">
      <button>Play</button>
    </Tooltip>,
  );
}

it('says what the control does once the control is reached', () => {
  play();
  expect(screen.queryByRole('tooltip')).toBeNull();
  // Focus is the way in a user without a pointer has, and it is the way in this
  // test has: Radix opens on both.
  act(() => screen.getByRole('button', { name: 'Play' }).focus());
  expect(screen.getByRole('tooltip').textContent).toBe('Play the video');
});

it('hands the control back untouched when it has nothing to add', () => {
  render(
    <Tooltip text="Play the video" disabled>
      <button>Play</button>
    </Tooltip>,
  );
  expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  expect(document.querySelector('[data-slot="tooltip-anchor"]')).toBeNull();
});

it('puts the class it is given around the control, not on it', () => {
  render(
    <Tooltip text="Play the video" className="block w-fit">
      <button className="w-full">Play</button>
    </Tooltip>,
  );
  const anchor = document.querySelector('[data-slot="tooltip-anchor"]');
  expect(anchor?.className).toContain('w-fit');
  // The control's own width is the one that decides how wide it is drawn.
  expect(screen.getByRole('button', { name: 'Play' }).className).toBe('w-full');
});

it('anchors on the caller’s own element when nothing may be wrapped around it', () => {
  render(
    <Tooltip text="Grid view" asChild>
      <button className="seg">Grid</button>
    </Tooltip>,
  );
  // The control itself is the anchor: no element was inserted around it, so a
  // row of neighbours stays a row of the parent's own children.
  const anchor = document.querySelector('[data-slot="tooltip-anchor"]');
  expect(anchor).toBe(screen.getByRole('button', { name: 'Grid' }));
  expect(anchor?.tagName).toBe('BUTTON');
  act(() => screen.getByRole('button', { name: 'Grid' }).focus());
  expect(screen.getByRole('tooltip').textContent).toBe('Grid view');
});

it('holds the words back for as long as it is told', () => {
  vi.useFakeTimers();
  try {
    render(
      <Tooltip text="A very long path" delayDuration={1000} asChild>
        <span>path/to/some/file.mp4</span>
      </Tooltip>,
    );
    // Read-only text cannot be focused, so the pointer is the way in — and the
    // open itself rides a timer, which is what makes the wait measurable.
    fireEvent.pointerMove(screen.getByText('path/to/some/file.mp4'));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByRole('tooltip').textContent).toBe('A very long path');
  } finally {
    vi.useRealTimers();
  }
});
