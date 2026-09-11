import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readLanguage, saveLanguage, synchronizeLanguage } from './language';
import type { LanguageSettings } from './language';
import { normalizeError } from './api';
import type { AppError } from './api';
import { ErrorNotice } from './ErrorNotice';

export function LanguageSetting() {
  const { t } = useTranslation();
  const [preference, setPreference] =
    useState<LanguageSettings['preference']>('system');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{
    error: AppError;
    value?: LanguageSettings['preference'];
  } | null>(null);
  async function load() {
    setSaving(true);
    setFailure(null);
    try {
      const value = await readLanguage();
      setPreference(value.preference);
    } catch (cause) {
      setFailure({ error: normalizeError(cause) });
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function change(value: LanguageSettings['preference']) {
    setSaving(true);
    setFailure(null);
    try {
      const result = await saveLanguage(value);
      setPreference(result.preference);
    } catch (cause) {
      setFailure({ error: normalizeError(cause), value });
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="space-y-2">
      <label className="flex flex-wrap items-center gap-4">
        {t('language')}
        <select
          className="select"
          disabled={saving}
          value={preference}
          onChange={(event) =>
            change(event.target.value as LanguageSettings['preference'])
          }
        >
          <option value="system">{t('system')}</option>
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </label>
      <p>{t('languageHelp')}</p>
      {failure && (
        <ErrorNotice
          error={failure.error}
          onRetry={
            saving
              ? undefined
              : () => (failure.value ? change(failure.value) : load())
          }
          onClose={() => setFailure(null)}
        />
      )}
    </section>
  );
}

export function LanguageFocusSync() {
  useEffect(() => {
    const refresh = () => {
      void synchronizeLanguage().catch(() => {});
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  return null;
}
