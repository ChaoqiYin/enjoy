import { invoke } from '@tauri-apps/api/core';
import i18n from 'i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { saveLanguage, synchronizeLanguage } from './language';
import type { LanguageSettings } from './language';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
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

it('does not overwrite a manual language change with an older system response', async () => {
  const first = deferred();
  vi.mocked(invoke)
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ preference: 'zh-CN', language: 'zh-CN' });
  const older = synchronizeLanguage();
  await saveLanguage('zh-CN');
  first.resolve({ preference: 'system', language: 'en' });
  await older;
  expect(i18n.language).toBe('zh-CN');
  expect(document.documentElement.lang).toBe('zh-CN');
});

it('defers focus reads while a manual preference is being saved', async () => {
  const saving = deferred();
  vi.mocked(invoke).mockReturnValueOnce(saving.promise);
  const saved = saveLanguage('zh-CN');
  await synchronizeLanguage();
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(i18n.language).toBe('en');
  saving.resolve({ preference: 'zh-CN', language: 'zh-CN' });
  await saved;
  expect(i18n.language).toBe('zh-CN');
  vi.mocked(invoke).mockResolvedValueOnce({
    preference: 'zh-CN',
    language: 'zh-CN',
  });
  await synchronizeLanguage();
  expect(invoke).toHaveBeenLastCalledWith('get_language');
});

it('restores focus synchronization after a failed preference save', async () => {
  vi.mocked(invoke).mockRejectedValueOnce(new Error('Save failed'));
  await expect(saveLanguage('zh-CN')).rejects.toThrow('Save failed');
  expect(i18n.language).toBe('en');
  vi.mocked(invoke).mockResolvedValueOnce({
    preference: 'system',
    language: 'zh-CN',
  });
  await synchronizeLanguage();
  expect(i18n.language).toBe('zh-CN');
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
