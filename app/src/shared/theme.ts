/**
 * The theme preference and how it becomes a document attribute.
 *
 * `styles.tailwind.css` turns `[data-theme='dark']` into the dark palette, so
 * every surface follows the one attribute written here. The preference lives
 * both in the stored settings (the source of truth) and in `localStorage`, so
 * the first frame after a reload is already drawn in the right theme; the
 * settings page reconciles the two when it opens.
 *
 * The two values are the old window's: the interface is drawn light or dark,
 * and there is no third "follow the system" choice to resolve. Dark is what an
 * unread preference falls back to, as it was in the old window's `index.html`
 * before any script ran.
 */

export type ThemePreference = 'light' | 'dark'

const THEME_KEY = 'enjoy/theme'

/** A stored value that is not one of the two is ignored, not guessed at. */
export function normalizeTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'dark'
}

export function storedTheme(): ThemePreference {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY) ?? undefined)
  } catch {
    return 'dark'
  }
}

/** Remember the preference and paint the document with it. */
export function applyTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, preference)
  } catch {
    // Private windows may refuse storage; the document still changes.
  }
  document.documentElement.dataset.theme = preference
}
