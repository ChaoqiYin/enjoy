import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import english from '../../../../shared/locales/en/common.json';
import { idleScan } from '../../test/fixtures';
import { ThumbnailProgress } from './ThumbnailProgress';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

function rebuilding(overrides = {}) {
  const onAction = vi.fn();
  const status = idleScan({
    operation: 'thumbnails',
    phase: 'processing',
    discovered: 200,
    processed: 50,
    currentPath: '\\\\?\\E:\\movies\\example.mp4',
    ...overrides,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <ThumbnailProgress status={status} onAction={onAction} />
    </I18nextProvider>,
  );
  return onAction;
}

it('says how far the rebuild has come, and where it is now', () => {
  rebuilding();
  expect(screen.getByText(/200 found, 50 processed/)).toBeTruthy();
  const bar = screen.getByRole('progressbar');
  expect(bar.getAttribute('aria-valuenow')).toBe('50');
  expect(bar.getAttribute('aria-valuemax')).toBe('200');
  expect(screen.getByText('25%')).toBeTruthy();
  // The path in front of the user is the path the panel spells out, not the
  // verbatim one the index stores.
  expect(screen.getByText('E:\\movies\\example.mp4')).toBeTruthy();
});

it('gives the whole path of the file it is on, once the pointer rests on it', () => {
  vi.useFakeTimers();
  try {
    rebuilding();
    // As in the scan panel: the truncated row completes itself on hover, and the
    // wait is the one that matches the native title it replaces.
    const line = screen.getByText('E:\\movies\\example.mp4');
    expect(line.getAttribute('data-slot')).toBe('tooltip-anchor');
    fireEvent.pointerMove(line);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip').textContent).toBe(
      'E:\\movies\\example.mp4',
    );
  } finally {
    vi.useRealTimers();
  }
});

it('says it is working before there is a count to draw a length from', () => {
  rebuilding({ discovered: 0, processed: 0, currentPath: '' });
  // No bar: a length drawn from zero would be a length it does not have.
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(document.querySelector('[data-slot="spinner"]')).toBeTruthy();
});

it('pauses a rebuild that is running, and resumes one that is paused', () => {
  const paused = rebuilding();
  fireEvent.click(
    screen.getByRole('button', { name: english.pauseRegeneration }),
  );
  expect(paused).toHaveBeenCalledWith('pause');

  cleanup();
  const resumed = rebuilding({ phase: 'paused' });
  const button = screen.getByRole('button', { name: english.resume });
  expect(button.getAttribute('data-variant')).toBe('success');
  fireEvent.click(button);
  expect(resumed).toHaveBeenCalledWith('resume');
});

it('cancels the rebuild from the same place', () => {
  const onAction = rebuilding();
  const button = screen.getByRole('button', {
    name: english.cancelRegeneration,
  });
  expect(button.getAttribute('data-variant')).toBe('secondary');
  fireEvent.click(button);
  expect(onAction).toHaveBeenCalledWith('cancel');
});
