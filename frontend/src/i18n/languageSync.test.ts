import { invoke } from '@tauri-apps/api/core';
import i18n from 'i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyLanguage, synchronizeLanguage } from './language';
import type { LanguageSettings } from '../shared/api';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  convertFileSrc: (path: string) => path,
}));

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: {}, 'zh-CN': {} } });
  document.documentElement.lang = 'en';
});
afterEach(() => vi.resetAllMocks());

function deferred() {
  let resolve!: (value: LanguageSettings) => void;
  const promise = new Promise<LanguageSettings>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('updates the resolved system language and document language', async () => {
  vi.mocked(invoke).mockResolvedValue({
    preference: 'system',
    language: 'zh-CN',
  });
  await synchronizeLanguage();
  expect(invoke).toHaveBeenCalledWith('get_language');
  expect(i18n.language).toBe('zh-CN');
  expect(document.documentElement.lang).toBe('zh-CN');
});

it('does not apply an older focus response after a newer response', async () => {
  const first = deferred();
  vi.mocked(invoke)
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ preference: 'system', language: 'zh-CN' });
  const older = synchronizeLanguage();
  await synchronizeLanguage();
  first.resolve({ preference: 'system', language: 'en' });
  await older;
  expect(i18n.language).toBe('zh-CN');
  expect(document.documentElement.lang).toBe('zh-CN');
});

// The preference has one owner now, so a read issued *after* a change answers
// with the change. What this holds is the other half: a read issued *before* it
// and answered after must not put the interface back to the language it was.
it('does not let a read in flight undo a language just applied', async () => {
  const first = deferred();
  vi.mocked(invoke).mockReturnValueOnce(first.promise);
  const older = synchronizeLanguage();
  // The user picks a language on the settings page: the save has landed, and
  // what is on screen is the language they picked.
  await applyLanguage({ preference: 'zh-CN', language: 'zh-CN' });
  first.resolve({ preference: 'system', language: 'en' });
  await older;
  expect(i18n.language).toBe('zh-CN');
  expect(document.documentElement.lang).toBe('zh-CN');
});

// The baseline (§10.1) has follow-system mode resolve the system language
// again whenever the app regains focus, and a synchronisation is how that
// arrives. Replaying the previous answer instead would leave the interface on
// the system language it started with until the next launch.
it('asks for the system language again on every synchronisation', async () => {
  vi.mocked(invoke).mockResolvedValueOnce({
    preference: 'system',
    language: 'zh-CN',
  });
  await synchronizeLanguage();
  expect(i18n.language).toBe('zh-CN');
  vi.mocked(invoke).mockResolvedValueOnce({
    preference: 'system',
    language: 'en',
  });
  await synchronizeLanguage();
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(i18n.language).toBe('en');
});
