import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import { LanguageSetting } from './LanguageSetting';
import { readLanguage, saveLanguage } from './language';
import english from './locales/en/common.json';
import errors from './locales/en/errors.json';

vi.mock('./language', () => ({
  readLanguage: vi.fn(),
  saveLanguage: vi.fn(),
  applyLanguage: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('keeps the saved preference on failure and retries the requested language', async () => {
  vi.mocked(readLanguage).mockResolvedValue({
    preference: 'system',
    language: 'en',
  });
  vi.mocked(saveLanguage)
    .mockRejectedValueOnce({
      code: 'settings.language.save_failed',
      params: {},
      errorId: 'err_save',
    })
    .mockResolvedValueOnce({ preference: 'zh-CN', language: 'zh-CN' });
  const i18n = createInstance();
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    resources: { en: { translation: english, errors } },
  });
  render(
    <I18nextProvider i18n={i18n}>
      <LanguageSetting />
    </I18nextProvider>,
  );
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  await waitFor(() => expect(select.disabled).toBe(false));
  fireEvent.change(select, { target: { value: 'zh-CN' } });
  await screen.findByRole('alert');
  expect(select.value).toBe('system');
  expect(screen.getByRole('alert').textContent).toContain('err_save');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(select.value).toBe('zh-CN'));
  expect(saveLanguage).toHaveBeenNthCalledWith(1, 'zh-CN');
  expect(saveLanguage).toHaveBeenNthCalledWith(2, 'zh-CN');
  expect(screen.queryByRole('alert')).toBeNull();
});
