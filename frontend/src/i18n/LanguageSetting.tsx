import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readLanguage, saveLanguage, synchronizeLanguage } from './language';
import type { LanguageSettings } from './language';
import { normalizeError } from '../shared/api';
import type { AppError } from '../shared/api';
import { ErrorNotice } from '../shared/ErrorNotice';

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
    <section className="border-b border-base-300 pb-5 space-y-3">
      <div className="flex w-full items-center justify-between gap-8 max-md:flex-col max-md:items-start max-md:items-start">
        <div>
          <h3 className="font-medium">{t('language')}</h3>
          <p className="text-sm opacity-65">{t('languageHelp')}</p>
        </div>
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
      </div>
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
