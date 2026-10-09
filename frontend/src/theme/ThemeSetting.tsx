import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MonitorSmartphone, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ErrorNotice } from '../shared/ErrorNotice';
import { RadioGroup, RadioGroupItem } from '../shared/ui/radio-group';
import { useCommand } from '../shared/useCommand';
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

/** The three choices, in the order the drawings put them. */
const options: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'system', icon: MonitorSmartphone },
  { value: 'light', label: 'lightTheme', icon: Sun },
  { value: 'dark', label: 'darkTheme', icon: Moon },
];

export function ThemeSetting() {
  const { t } = useTranslation();
  const { state, update } = useSettings();
  const preference = state.theme;
  const {
    busy: saving,
    failure,
    dismissFailure,
    run,
  } = useCommand<ThemePreference>();
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => preference === 'system' && applyTheme(preference);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [preference]);
  // The theme is applied only once it has been stored, and that order is
  // inside the action: applying it first and saving afterwards would leave the
  // document themed one way and the stored preference another when the save
  // fails, with nothing on screen saying so. It stays in here rather than after
  // the call because a failed command is the caller's business only through
  // `failure` — what `run` promises is that this did not happen.
  function change(value: ThemePreference) {
    return run(value, async () => {
      await update({ theme: value });
      applyTheme(value);
    });
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t('theme')}</h3>
        <p className="text-sm text-muted-foreground">{t('themeHelp')}</p>
      </div>
      {/* Three cards rather than a list: which theme is on is a choice of one
          out of three, which is what a radio group is, and drawing each choice
          as a card that can be pressed whole is what the drawing does. */}
      <RadioGroup
        aria-label={t('theme')}
        value={preference}
        disabled={saving}
        onValueChange={(value) => void change(value as ThemePreference)}
        className="grid gap-3 sm:grid-cols-3"
      >
        {options.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:text-foreground hover:bg-accent"
          >
            <RadioGroupItem value={value} />
            <Icon size={18} aria-hidden="true" />
            <span>{t(label)}</span>
          </label>
        ))}
      </RadioGroup>
      {failure && (
        <ErrorNotice
          error={failure.error}
          onRetry={saving ? undefined : () => void change(failure.value)}
          onClose={dismissFailure}
        />
      )}
    </div>
  );
}
