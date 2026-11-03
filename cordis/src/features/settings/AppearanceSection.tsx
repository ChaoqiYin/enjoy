import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Button } from '../../shared/ui/button'
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
  onLanguageChange,
  onThemeChange,
}: {
  language: Language
  theme: ThemePreference
  onLanguageChange: (language: Language) => void
  onThemeChange: (theme: ThemePreference) => void
}): ReactElement {
  const { t } = useTranslation()
  const { api } = useServices()

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{t('appearance')}</h2>

      <div className="mt-3 space-y-1">
        <label htmlFor="settings-language" className="text-sm font-medium">
          {t('language')}
        </label>
        <p className="text-sm text-muted-foreground">{t('languageHelp')}</p>
        <select
          id="settings-language"
          aria-label={t('language')}
          value={language}
          onChange={(event) =>
            onLanguageChange(event.target.value === 'en' ? 'en' : 'zh-CN')
          }
          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
        >
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </div>

      <div className="mt-5 space-y-1">
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
      </div>

      <div className="mt-5 space-y-1">
        <p className="text-sm font-medium">{t('repository')}</p>
        <p className="text-sm text-muted-foreground">{t('repositoryHelp')}</p>
        <Button
          data-testid="open-repository"
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() => api.openExternal(REPOSITORY_URL)}
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          {t('openRepository')}
        </Button>
      </div>
    </section>
  )
}
