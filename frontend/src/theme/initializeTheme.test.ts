import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initializeTheme } from './ThemeSetting';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  convertFileSrc: (path: string) => path,
}));

// `initializeTheme` draws the window before the interface is rendered, and the
// theme it draws is the one the settings page will show. The two used to come
// from different places — the page from the stored preference, the startup from
// a browser storage key nothing has ever written — so the page could say
// "light" over a window drawn dark and go on saying it until someone clicked.
// What is held here is that the startup reads the stored preference.

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.resetAllMocks();
  delete document.documentElement.dataset.theme;
});

it('draws the document in the stored preference', async () => {
  vi.mocked(invoke).mockResolvedValue({ language: 'system', theme: 'light' });
  await initializeTheme();
  expect(invoke).toHaveBeenCalledWith('get_settings');
  expect(document.documentElement.dataset.theme).toBe('light');
});

it('leaves the document as it stands when the preference cannot be read', async () => {
  vi.mocked(invoke).mockRejectedValue(new Error('no preference'));
  await initializeTheme();
  // Nothing was put right, because nothing was wrong: `index.html` declares the
  // document dark before any script runs, and dark is what the backend answers
  // for a preference it cannot resolve.
  expect(document.documentElement.dataset.theme).toBeUndefined();
});
