import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem(key);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => preference === 'system' && applyTheme(preference);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [preference]);
  const change = (value: ThemePreference) => {
    setPreference(value);
    localStorage.setItem(key, value);
    applyTheme(value);
  };
  return (
    <section className="border-b border-base-300 pb-5 space-y-3">
      <div className="flex w-full items-center justify-between gap-8 max-md:flex-col max-md:items-start max-md:items-start">
        <div>
          <h3 className="font-medium">{t('theme')}</h3>
          <p className="text-sm opacity-65">{t('themeHelp')}</p>
        </div>
        <select
          className="select"
          aria-label={t('theme')}
          value={preference}
          onChange={(e) => change(e.target.value as ThemePreference)}
        >
          <option value="system">{t('system')}</option>
          <option value="light">{t('lightTheme')}</option>
          <option value="dark">{t('darkTheme')}</option>
        </select>
      </div>
    </section>
  );
}
