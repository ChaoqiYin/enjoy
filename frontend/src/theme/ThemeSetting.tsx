import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeError } from '../shared/api';
import type { AppError } from '../shared/api';
import { ErrorNotice } from '../shared/ErrorNotice';
import { useSettings } from '../settings/SettingsProvider';

export type ThemePreference = 'system' | 'light' | 'dark';
const key = 'enjoy-theme';

function applyTheme(value: ThemePreference) {
  const dark =
    value === 'dark' ||
    (value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function initializeTheme() {
  const saved = localStorage.getItem(key) as ThemePreference | null;
  applyTheme(saved === 'light' || saved === 'dark' ? saved : 'system');
}

export function ThemeSetting() {
  const { t } = useTranslation();
  const { state, update } = useSettings();
  const preference = state.theme;
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{
    error: AppError;
    value: ThemePreference;
  } | null>(null);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => preference === 'system' && applyTheme(preference);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [preference]);
  // The theme is applied only once it has been stored. Applying it first and
  // saving afterwards would leave the document themed one way and the stored
  // preference another when the save fails, with nothing on screen saying so.
  async function change(value: ThemePreference) {
    setSaving(true);
    setFailure(null);
    try {
      await update({ theme: value });
      applyTheme(value);
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
          <h3 className="font-medium">{t('theme')}</h3>
          <p className="text-sm opacity-65">{t('themeHelp')}</p>
        </div>
        <select
          className="select"
          disabled={saving}
          aria-label={t('theme')}
          value={preference}
          onChange={(e) => void change(e.target.value as ThemePreference)}
        >
          <option value="system">{t('system')}</option>
          <option value="light">{t('lightTheme')}</option>
          <option value="dark">{t('darkTheme')}</option>
        </select>
      </div>
      {failure && (
        <ErrorNotice
          error={failure.error}
          onRetry={saving ? undefined : () => void change(failure.value)}
          onClose={() => setFailure(null)}
        />
      )}
    </section>
  );
}
