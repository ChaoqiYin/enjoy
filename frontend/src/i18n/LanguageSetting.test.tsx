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
  convertFileSrc: (path: string) => path,
}));

// jsdom lays nothing out and implements no scrolling, which is what Radix
// reaches for when it brings the chosen option into view.
Element.prototype.scrollIntoView = vi.fn();
// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms per call; the select's popper asks every ancestor of its
// list whether it sits in the top layer. Nothing here is a top-layer element.
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

// The preference lives in the settings store now, so what the control shows and
// what a change sends are two answers of the same `invoke`.
function answers(save: () => Promise<unknown>) {
  vi.mocked(invoke).mockImplementation((command: string) => {
    if (command === 'get_settings')
      return Promise.resolve({ language: 'system', theme: 'dark' });
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

/** The two languages are named in themselves, so the option is looked up by the
 *  word a reader would be looking for rather than by a translation of it. */
function choose(label: string) {
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name: label }));
}

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
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('get_settings'));
  choose('简体中文');
  await screen.findByRole('alert');
  // The stored preference did not move, so the control still shows what is
  // stored rather than the choice that was refused.
  expect(screen.getByRole('combobox').textContent).toContain(english.system);
  expect(screen.getByRole('alert').textContent).toContain('err_save');

  answers(() => Promise.resolve({ language: 'zh-CN', theme: 'dark' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(screen.getByRole('combobox').textContent).toContain('简体中文'),
  );
  expect(screen.queryByRole('alert')).toBeNull();
});
