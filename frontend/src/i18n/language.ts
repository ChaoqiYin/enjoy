import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readLanguage } from '../shared/api';
import type { LanguageSettings } from '../shared/api';
import english from '../../../shared/locales/en/common.json';
import chinese from '../../../shared/locales/zh-CN/common.json';
import englishErrors from '../../../shared/locales/en/errors.json';
import chineseErrors from '../../../shared/locales/zh-CN/errors.json';

let languageRevision = 0;

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

export async function applyLanguage(settings: LanguageSettings) {
  // Applying a language is what invalidates every read that was in flight
  // before it. The preference has one owner now, so a read issued *after* a
  // change answers with the change — but one issued before it and answered
  // after would put the interface back to the language it was, and this is the
  // line that says so.
  ++languageRevision;
  await i18n.changeLanguage(settings.language);
  document.documentElement.lang = settings.language;
}

export async function synchronizeLanguage() {
  const revision = ++languageRevision;
  const settings = await readLanguage();
  if (revision === languageRevision) await applyLanguage(settings);
}
