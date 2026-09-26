import { useTranslation } from 'react-i18next';
import type { AppError } from './api';

type Translator = Pick<ReturnType<typeof useTranslation>, 't' | 'i18n'>;

/**
 * The sentence an error code stands for, and a general one for a code this
 * build has no translation for. A code that arrives with no words behind it
 * must never reach the screen as the code itself, and both places that show an
 * error to the user — the notice toast and the dialog that reports in place —
 * answer that the same way.
 */
export function errorMessage({ t, i18n }: Translator, error: AppError) {
  const key = `errors:${error.code}`;
  return i18n.exists(key) ? t(key, error.params) : t('errors:app.unexpected');
}
