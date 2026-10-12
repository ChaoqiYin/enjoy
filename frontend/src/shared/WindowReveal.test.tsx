import { invoke } from '@tauri-apps/api/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WindowReveal } from './WindowReveal';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  convertFileSrc: (path: string) => path,
}));

beforeEach(() => {
  // The command answers with nothing, and the effect holds on to that answer to
  // drop a rejection off it. A mock returning `undefined` would have no promise
  // to attach to, and the effect would throw where the real call does not.
  vi.mocked(invoke).mockResolvedValue(undefined as never);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

// Whether the window's first visible frame is the interface is not assertable
// here — jsdom has no window to show and no frame to paint. What is held is the
// one thing this module decides: that the backend is asked to show the window,
// and asked once, with what it wraps drawn around it.

it('asks the backend to show the window', () => {
  render(
    <WindowReveal>
      <p>library</p>
    </WindowReveal>,
  );
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('show_window');
});

it('draws what it wraps', () => {
  render(
    <WindowReveal>
      <p>library</p>
    </WindowReveal>,
  );
  expect(screen.getByText('library')).toBeTruthy();
});

it('asks once, however many times it renders', () => {
  const { rerender } = render(
    <WindowReveal>
      <p>library</p>
    </WindowReveal>,
  );
  rerender(
    <WindowReveal>
      <p>settings</p>
    </WindowReveal>,
  );
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('says nothing when the window cannot be shown', async () => {
  vi.mocked(invoke).mockRejectedValue(new Error('no window'));
  render(
    <WindowReveal>
      <p>library</p>
    </WindowReveal>,
  );
  // The report was made on the side that can make one. An escaped rejection here
  // would be a console error rather than a report, and vitest fails the run on
  // one — which is why the effect drops it.
  await act(async () => {});
  expect(screen.getByText('library')).toBeTruthy();
});
