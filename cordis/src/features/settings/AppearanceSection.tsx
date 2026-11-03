import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Button } from '../../shared/ui/button'
import { Select } from '../../shared/ui/select'
import { useServices } from '../../shared/services'
import type { ThemePreference } from '../../shared/theme'

export type Language = 'en' | 'zh-CN'

const REPOSITORY_URL = 'https://github.com/ChaoqiYin/enjoy'

const THEMES: ThemePreference[] = ['light', 'dark', 'system']

const THEME_LABELS: Record<ThemePreference, string> = {
  light: 'themeLight',
  dark: 'themeDark',
  system: 'themeSystem',
}

export function AppearanceSection({
  language,
  theme,
  languageError,
  themeError,
  onLanguageChange,
  onThemeChange,
  onRetryLanguage,
  onRetryTheme,
}: {
  language: Language
  theme: ThemePreference
  languageError: boolean
  themeError: boolean
  onLanguageChange: (language: Language) => void
  onThemeChange: (theme: ThemePreference) => void
  onRetryLanguage: () => void
  onRetryTheme: () => void
}): ReactElement {
  const { t } = useTranslation()
  const { api } = useServices()

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{t('appearance')}</h2>

      <div
        data-testid="appearance-language"
        className="mt-3 space-y-1"
      >
        <label htmlFor="settings-language" className="text-sm font-medium">
          {t('language')}
        </label>
        <p className="text-sm text-muted-foreground">{t('languageHelp')}</p>
        <Select
          id="settings-language"
          ariaLabel={t('language')}
          value={language}
          options={[
            { value: 'zh-CN', label: '简体中文' },
            { value: 'en', label: 'English' },
          ]}
          onChange={onLanguageChange}
          className="mt-1 w-full sm:w-64"
        />
        {languageError && (
          <SaveFailure onRetry={onRetryLanguage} />
        )}
      </div>

      <div data-testid="appearance-theme" className="mt-5 space-y-1">
        <p className="text-sm font-medium">{t('theme')}</p>
        <p className="text-sm text-muted-foreground">{t('themeHelp')}</p>
        <div role="group" aria-label={t('theme')} className="mt-1 flex flex-wrap gap-2">
          {THEMES.map((option) => (
            <Button
              key={option}
              data-testid={`theme-${option}`}
              variant={theme === option ? 'primary' : 'outline'}
              size="sm"
              aria-pressed={theme === option}
              onClick={() => onThemeChange(option)}
            >
              {t(THEME_LABELS[option])}
            </Button>
          ))}
        </div>
        {themeError && <SaveFailure onRetry={onRetryTheme} />}
      </div>

      <div className="mt-5 space-y-1">
        <p className="text-sm font-medium">{t('repository')}</p>
        <p className="text-sm text-muted-foreground">{t('repositoryHelp')}</p>
        <Button
          data-testid="open-repository"
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() => {
            // The URL is a constant, so a non-`unsupported` failure has no
            // recovery worth interrupting the page for.
            void api.openExternal(REPOSITORY_URL).catch(() => {})
          }}
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          {t('openRepository')}
        </Button>
      </div>
    </section>
  )
}

function SaveFailure({ onRetry }: { onRetry: () => void }): ReactElement {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className="mt-2 flex items-center gap-2 text-sm text-destructive"
    >
      <span>{t('settingsSaveFailed')}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  )
}
