/**
 * The theme preference and how it becomes a document attribute.
 *
 * `styles.tailwind.css` turns `[data-theme='dark']` into the dark palette, so
 * every surface follows the one attribute written here. The preference lives
 * both in the stored settings (the source of truth) and in `localStorage`, so
 * the first frame after a reload is already drawn in the right theme; the
 * settings page reconciles the two when it opens.
 */

export type ThemePreference = 'light' | 'dark' | 'system'

const THEME_KEY = 'enjoy/theme'

/** A stored value that is not one of the three is ignored, not guessed at. */
export function normalizeTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : 'system'
}

export function storedTheme(): ThemePreference {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY) ?? undefined)
  } catch {
    return 'system'
  }
}

/** The colour actually in force; `system` asks the platform at this moment. */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  } catch {
    return 'light'
  }
}

/** Remember the preference and paint the document with the colour it resolves to. */
export function applyTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, preference)
  } catch {
    // Private windows may refuse storage; the document still changes.
  }
  document.documentElement.dataset.theme = resolveTheme(preference)
}

/**
 * Follow the platform while the preference is `system`. Returns a teardown
 * that is safe to call when the platform has no media query support.
 */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
