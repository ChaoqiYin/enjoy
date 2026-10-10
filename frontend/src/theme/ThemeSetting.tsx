import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MonitorSmartphone, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ErrorNotice } from '../shared/ErrorNotice';
import { RubberSegment } from '../shared/ui/rubber-segment';
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
      {/* A segmented control rather than three cards, and it is the same kind of
          thing underneath: the vendored `RubberSegment` is a `radiogroup` whose
          segments are `radio`s with `aria-checked`, one tab stop and the arrow
          keys, which is exactly what the `RadioGroup` it replaced provided
          (ADR 0023). Nothing is given up for the sliding thumb.

          Two colours are passed and two are left alone. The track and the
          unselected labels keep the component's defaults — `--background` and
          `--muted-foreground` — while the thumb and the selected label are
          handed `--secondary` and `--secondary-foreground` rather than the
          component's own `--accent` and `--accent-foreground`.

          `--accent` is the elevated surface, and in the light theme it is one:
          `#ffe4e6` against a near-white track. In the dark theme it is not —
          `#1a1e26` sits nine to fifteen levels above the `#111317` page, which
          is the weight of a hover wash, not of the one thing on the control
          that has to be legible with no pointer on it. A surface in the dark
          theme is read off its border, and a thumb has no border. `--secondary`
          (`surface-container-high`) is a step further up in both themes, so the
          selected segment is a block in both. The settings rail and the chosen
          segment of `ToggleGroup` wear the same fill, so the three places that
          paint a choice agree.

          A literal could not have done this — it could not be right in both
          themes — nor could just any pair of semantic tokens, since none of
          them flips on its own: `--muted` sits *below* `--card` in light and
          *above* it in dark.

          The focus ring is re-drawn in `--ring`, and said to be solid. The
          component draws the ring in the thumb colour, which its author could
          assume was an accent; with the thumb a surface, that is a
          surface-coloured ring on a surface-coloured track — in *both* themes,
          the light one included. `--ring` is what every other focusable thing
          in this repository draws. The `outline-solid` is needed because the
          segment is `outline-none`, which sets `--tw-outline-style: none`, and
          `focus-visible:outline-2` takes its style from that same variable — so
          upstream's ring sets a width and then never draws. Measured before:
          `2px none`. Measured after: `2px solid`, `rgb(225, 29, 72)` in light
          and `rgb(255, 51, 75)` in dark, three pixels clear of the segment.

          The frame is an `outline` and not a `border` on purpose. The control
          measures its track with `getBoundingClientRect` and then insets the
          thumb from the padding box, so a border — which shrinks that box —
          would put the thumb and the segments a pixel apart. An outline takes
          no part in layout, so the measurement stays the one upstream wrote. */}
      <RubberSegment
        aria-label={t('theme')}
        items={options.map(({ value, label, icon: Icon }) => ({
          value,
          label: t(label),
          icon: <Icon size={16} aria-hidden="true" />,
        }))}
        value={preference}
        onChange={(value) => void change(value as ThemePreference)}
        disabled={saving}
        thumbColor="var(--secondary)"
        activeTextColor="var(--secondary-foreground)"
        className="w-full outline-1 outline-border [&_[role=radio]]:focus-visible:outline-solid [&_[role=radio]]:focus-visible:outline-ring"
      />
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
