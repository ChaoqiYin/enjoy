import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
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
