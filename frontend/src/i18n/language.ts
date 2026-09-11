import { invoke, isTauri } from '@tauri-apps/api/core';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import english from '../../../shared/locales/en/common.json';
import chinese from '../../../shared/locales/zh-CN/common.json';
import englishErrors from '../../../shared/locales/en/errors.json';
import chineseErrors from '../../../shared/locales/zh-CN/errors.json';

let languageRevision = 0;
let pendingLanguageSaves = 0;

export interface LanguageSettings {
  preference: 'system' | 'zh-CN' | 'en';
  language: 'zh-CN' | 'en';
}

export async function readLanguage(): Promise<LanguageSettings> {
  if (!isTauri())
    return {
      preference: 'system',
      language: navigator.language.toLowerCase().startsWith('zh')
        ? 'zh-CN'
        : 'en',
    };
  return invoke<LanguageSettings>('get_language');
}

export async function initializeLanguage() {
  const settings = await readLanguage();
  await i18n.use(initReactI18next).init({
    lng: settings.language,
    fallbackLng: 'en',
    resources: {
      en: { translation: english, errors: englishErrors },
      'zh-CN': { translation: chinese, errors: chineseErrors },
    },
    defaultNS: 'translation',
    keySeparator: false,
    interpolation: { escapeValue: false },
  });
  document.documentElement.lang = settings.language;
}

export async function saveLanguage(preference: LanguageSettings['preference']) {
  ++languageRevision;
  ++pendingLanguageSaves;
  try {
    const settings = await invoke<LanguageSettings>('set_language', {
      preference,
    });
    await applyLanguage(settings);
    return settings;
  } finally {
    --pendingLanguageSaves;
    ++languageRevision;
  }
}

export async function applyLanguage(settings: LanguageSettings) {
  await i18n.changeLanguage(settings.language);
  document.documentElement.lang = settings.language;
}

export async function synchronizeLanguage() {
  if (pendingLanguageSaves > 0) return;
  const revision = ++languageRevision;
  const settings = await readLanguage();
  if (revision === languageRevision) await applyLanguage(settings);
}
