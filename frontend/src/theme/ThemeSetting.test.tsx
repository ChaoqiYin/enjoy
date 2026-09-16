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
    state: { language: 'system' as const, theme: 'system' as const },
    update: vi.fn(),
  },
}));

vi.mock('../settings/SettingsProvider', () => ({
  useSettings: () => settings,
}));

const i18n = createInstance();

beforeEach(async () => {
  settings.state = { language: 'system', theme: 'system' };
  settings.update.mockReset();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
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

function choose(value: string) {
  fireEvent.change(screen.getByRole('combobox'), { target: { value } });
}

it('applies the theme once it has been stored', async () => {
  settings.update.mockResolvedValue(undefined);
  render(view());
  choose('dark');
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
  choose('dark');
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
  choose('dark');
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe('dark'),
  );
  expect(settings.update).toHaveBeenNthCalledWith(2, { theme: 'dark' });
  expect(screen.queryByRole('alert')).toBeNull();
});
