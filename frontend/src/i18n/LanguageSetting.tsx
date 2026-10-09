import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { synchronizeLanguage } from './language';
import { readLanguage } from '../shared/api';
import type { LanguageSettings } from '../shared/api';
import { ErrorNotice } from '../shared/ErrorNotice';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../shared/ui/select';
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
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t('language')}</h3>
        <p className="text-sm text-muted-foreground">{t('languageHelp')}</p>
      </div>
      <Select
        value={preference}
        disabled={saving}
        onValueChange={(value) =>
          void change(value as LanguageSettings['preference'])
        }
      >
        <SelectTrigger aria-label={t('language')} className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">{t('system')}</SelectItem>
          {/* The two languages are named in themselves rather than in the
              language the interface is currently in: a reader looking for their
              own has to be able to read the entry for it. */}
          <SelectItem value="zh-CN">简体中文</SelectItem>
          <SelectItem value="en">English</SelectItem>
        </SelectContent>
      </Select>
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
    </div>
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
