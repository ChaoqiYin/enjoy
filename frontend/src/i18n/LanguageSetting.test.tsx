import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import i18n from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LanguageSetting } from './LanguageSetting';
import { SettingsProvider } from '../settings/SettingsProvider';
import english from '../../../shared/locales/en/common.json';
import errors from '../../../shared/locales/en/errors.json';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));

// The preference lives in the settings store now, so what the select shows and
// what a change sends are two answers of the same `invoke`.
function answers(save: () => Promise<unknown>) {
  vi.mocked(invoke).mockImplementation((command: string) => {
    if (command === 'get_settings')
      return Promise.resolve({ language: 'system', theme: 'system' });
    if (command === 'save_settings') return save();
    return Promise.resolve(undefined);
  });
}

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    resources: { en: { translation: english, errors } },
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('keeps the saved preference on failure and retries the requested language', async () => {
  answers(() =>
    Promise.reject({
      code: 'settings.language.save_failed',
      params: {},
      errorId: 'err_save',
    }),
  );
  render(
    <I18nextProvider i18n={i18n}>
      <SettingsProvider>
        <LanguageSetting />
      </SettingsProvider>
    </I18nextProvider>,
  );
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('get_settings'));
  fireEvent.change(select, { target: { value: 'zh-CN' } });
  await screen.findByRole('alert');
  expect(select.value).toBe('system');
  expect(screen.getByRole('alert').textContent).toContain('err_save');

  answers(() => Promise.resolve({ language: 'zh-CN', theme: 'system' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(select.value).toBe('zh-CN'));
  expect(screen.queryByRole('alert')).toBeNull();
});
