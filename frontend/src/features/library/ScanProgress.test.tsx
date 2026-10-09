import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import english from '../../../../shared/locales/en/common.json';
import { idleScan } from '../../test/fixtures';
import { ScanProgress } from './ScanProgress';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

function scanning(overrides = {}) {
  const onAction = vi.fn();
  const status = idleScan({
    phase: 'processing',
    discovered: 200,
    processed: 50,
    currentPath: '\\\\?\\E:\\movies\\example.mp4',
    ...overrides,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <ScanProgress status={status} onAction={onAction} />
    </I18nextProvider>,
  );
  return onAction;
}

it('says how far the scan has come, and where it is now', () => {
  scanning();
  expect(screen.getByText(/200 found, 50 processed/)).toBeTruthy();
  // The bar is the interface's own (shadcn), drawn from the counts rather than
  // from a native `<progress>`: what the screen shows and what assistive
  // technology is told come from the same number. daisyUI's `progress` class
  // was on a native element and, with the plugin gone, drew nothing at all.
  const bar = screen.getByRole('progressbar');
  expect(bar.getAttribute('aria-valuenow')).toBe('50');
  expect(bar.getAttribute('aria-valuemax')).toBe('200');
  expect(screen.getByText('25%')).toBeTruthy();
  // The path in front of the user is the path the panel spells out, not the
  // verbatim one the index stores.
  expect(screen.getByText('E:\\movies\\example.mp4')).toBeTruthy();
});

it('says it is working before there is a count to draw a length from', () => {
  scanning({ discovered: 0, processed: 0, currentPath: '' });
  // No bar: a length drawn from zero would be a length it does not have. The
  // placeholder is the interface's own spinner — the daisyUI `loading` span drew
  // nothing once the plugin was gone, so the panel looked like it had hung.
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(document.querySelector('[data-slot="spinner"]')).toBeTruthy();
});

it('pauses a scan that is running, and resumes one that is paused', () => {
  const paused = scanning();
  fireEvent.click(screen.getByRole('button', { name: english.pause }));
  expect(paused).toHaveBeenCalledWith('pause');

  cleanup();
  const resumed = scanning({ phase: 'paused' });
  const button = screen.getByRole('button', { name: english.resume });
  expect(button.getAttribute('data-variant')).toBe('success');
  fireEvent.click(button);
  expect(resumed).toHaveBeenCalledWith('resume');
});

it('cancels the scan from the same place', () => {
  const onAction = scanning();
  const button = screen.getByRole('button', { name: english.cancelScan });
  // Neutral rather than the error red daisyUI wore: stopping a scan is a close,
  // not a removal, and the two panels that share this dialog say it the same way
  // (`ThumbnailProgress`, `UpdateSetting`).
  expect(button.getAttribute('data-variant')).toBe('secondary');
  fireEvent.click(button);
  expect(onAction).toHaveBeenCalledWith('cancel');
});
