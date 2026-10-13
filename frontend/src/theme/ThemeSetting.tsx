import { useTranslation } from 'react-i18next';
import { Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { readTheme } from '../shared/api';
import { ErrorNotice } from '../shared/ErrorNotice';
import { RubberSegment } from '../shared/ui/rubber-segment';
import { useCommand } from '../shared/useCommand';
import { useSettings } from '../settings/SettingsProvider';

export type ThemePreference = 'light' | 'dark';

function applyTheme(value: ThemePreference) {
  document.documentElement.dataset.theme = value;
}

/**
 * Draws the document in the theme the stored preference names, before the
 * interface is rendered.
 *
 * The preference is read from the backend, not from `localStorage`. It used to
 * be `localStorage['enjoy-theme']`, a key nothing in this repository has ever
 * written — so the read always missed, and the document came out dark whatever
 * the settings page said. That is exactly what the two of them disagreed about:
 * the page rendered the stored preference while the startup rendered a key
 * nobody writes, and they agreed only after someone clicked.
 *
 * A failed read leaves the theme as it is. The document is already dark —
 * `index.html` says so before any script runs, and dark is what the backend
 * answers for a preference it cannot resolve — so there is nothing to put
 * right, and a window is not worth refusing to open over its colour. The
 * settings page reads the same preference again and will show what it holds.
 */
export async function initializeTheme() {
  try {
    applyTheme(await readTheme());
  } catch {
    // Left as the document already has it.
  }
}

/** The two choices, in the order the drawings put them. */
const options: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
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
          handed `--selection` and `--selection-foreground` rather than the
          component's own `--accent` and `--accent-foreground`.

          That pair is one semantic slot whose two values differ by theme: the
          brand red in the light theme, the grey step in the dark one. Neither
          the component's `--accent` pair nor a single token could have served —
          `--accent` is a surface on the near-white page and a hover wash nine to
          fifteen levels above the `#111317` one, where a thumb has no border for
          the eye to fall back on, and no semantic token flips on its own
          (`--muted` sits *below* `--card` in light and *above* it in dark).
          `:root` in `style.css` carries both values and why they differ. The
          settings rail and the chosen segment of `ToggleGroup` wear the same
          fill, so the three places that paint a choice agree.

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
        thumbColor="var(--selection)"
        activeTextColor="var(--selection-foreground)"
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
