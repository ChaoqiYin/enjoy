import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeSetting } from './ThemeSetting';
import english from '../../../shared/locales/en/common.json';
import errors from '../../../shared/locales/en/errors.json';

const { settings } = vi.hoisted(() => ({
  settings: {
    state: {
      language: 'system' as 'system' | 'en' | 'zh-CN',
      theme: 'system' as 'system' | 'light' | 'dark',
    },
    update: vi.fn(),
  },
}));

vi.mock('../settings/SettingsProvider', () => ({
  useSettings: () => settings,
}));

const i18n = createInstance();

// The system's preference is a fact only the platform holds, so this stands in
// for it — both the value it is asked for and the change it reports when the
// system flips.
let systemDark = false;
let mediaListeners: Array<() => void> = [];

beforeEach(async () => {
  settings.state = { language: 'system', theme: 'system' };
  settings.update.mockReset();
  systemDark = false;
  mediaListeners = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return systemDark;
      },
      addEventListener: (_event: string, listener: () => void) => {
        mediaListeners.push(listener);
      },
      removeEventListener: vi.fn(),
    })),
  );
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    resources: { en: { translation: english, errors } },
  });
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function view() {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeSetting />
    </I18nextProvider>
  );
}

/** The three themes are a choice of one, so they are the group's radios rather
 *  than the entries of a menu that has to be opened first. */
it('offers following the system, light, and dark', () => {
  render(view());
  expect(screen.getByRole('radiogroup', { name: english.theme })).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(3);
  expect(
    screen
      .getByRole('radio', { name: english.system })
      .getAttribute('aria-checked'),
  ).toBe('true');
});

function choose(value: string) {
  fireEvent.click(screen.getByRole('radio', { name: value }));
}

it('applies the theme once it has been stored', async () => {
  settings.update.mockResolvedValue(undefined);
  render(view());
  choose(english.darkTheme);
  await waitFor(() =>
    expect(settings.update).toHaveBeenCalledWith({ theme: 'dark' }),
  );
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('reports a save that failed, and leaves the applied theme alone', async () => {
  settings.update.mockRejectedValue({
    code: 'settings.theme.save_failed',
    params: {},
    errorId: 'err_theme',
  });
  render(view());
  choose(english.darkTheme);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('err_theme');
  // The document must not end up themed one way while the stored preference
  // says another, which is what applying first and saving afterwards did.
  expect(document.documentElement.dataset.theme).toBeUndefined();
});

it('retries the theme the user asked for', async () => {
  settings.update
    .mockRejectedValueOnce({
      code: 'settings.theme.save_failed',
      params: {},
      errorId: 'err_theme',
    })
    .mockResolvedValueOnce(undefined);
  render(view());
  choose(english.darkTheme);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe('dark'),
  );
  expect(settings.update).toHaveBeenNthCalledWith(2, { theme: 'dark' });
  expect(screen.queryByRole('alert')).toBeNull();
});

it('follows the system while the preference is to follow it', () => {
  render(view());
  systemDark = true;
  mediaListeners.forEach((listener) => listener());
  expect(document.documentElement.dataset.theme).toBe('dark');
  systemDark = false;
  mediaListeners.forEach((listener) => listener());
  expect(document.documentElement.dataset.theme).toBe('light');
});

it('leaves a theme the user picked alone when the system changes', () => {
  // The system is only read while the preference is to follow it; once a theme
  // is named, a change the system reports is not the user's answer to move.
  settings.state = { language: 'system', theme: 'dark' };
  render(view());
  systemDark = true;
  mediaListeners.forEach((listener) => listener());
  expect(document.documentElement.dataset.theme).toBeUndefined();
});
