import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { synchronizeLanguage } from './language';
import { readLanguage } from '../shared/api';
import type { LanguageSettings } from '../shared/api';
import { ErrorNotice } from '../shared/ErrorNotice';
import { useCommand } from '../shared/useCommand';
import { useSettings } from '../settings/SettingsProvider';

export function LanguageSetting() {
  const { t } = useTranslation();
  const { state, update } = useSettings();
  const preference = state.language;
  // `undefined` is a value here and not a missing one: reading the stored
  // language has nothing to repeat, so its failure carries nothing, and the
  // retry below tells the two apart by that.
  const {
    busy: saving,
    failure,
    dismissFailure,
    run,
  } = useCommand<LanguageSettings['preference'] | undefined>();
  function load() {
    return run(undefined, readLanguage);
  }
  function change(value: LanguageSettings['preference']) {
    return run(value, () => update({ language: value }));
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
          onClose={dismissFailure}
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
