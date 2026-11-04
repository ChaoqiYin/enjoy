import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Moon, Sun, type LucideIcon } from 'lucide-react'
import { Button } from '../../shared/ui/button'
import { RubberSegment } from '../../shared/ui/rubber-segment'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../shared/ui/select'
import type { ThemePreference } from '../../shared/theme'

export type Language = 'en' | 'zh-CN'

const THEMES: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'themeLight', icon: Sun },
  { value: 'dark', label: 'themeDark', icon: Moon },
]

/**
 * The 常规 block's two preferences: the language the interface speaks, and the
 * theme it is drawn in.
 *
 * It draws no card of its own — the page puts it in one — and the two are
 * blocks of the same weight, so they are spaced the way the old page spaced
 * them rather than each becoming a section under a second heading.
 */
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

  return (
    <div className="space-y-6">
      <div data-testid="appearance-language" className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t('language')}</h3>
          <p className="text-sm text-muted-foreground">{t('languageHelp')}</p>
        </div>
        <Select
          value={language}
          onValueChange={(value) => onLanguageChange(value as Language)}
        >
          <SelectTrigger
            id="settings-language"
            aria-label={t('language')}
            className="w-full sm:w-64"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* The two languages are named in themselves rather than in the
                language the interface is currently in: a reader looking for
                their own has to be able to read the entry for it. */}
            <SelectItem value="zh-CN">简体中文</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
        {languageError && <SaveFailure onRetry={onRetryLanguage} />}
      </div>

      <div data-testid="appearance-theme" className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t('theme')}</h3>
          <p className="text-sm text-muted-foreground">{t('themeHelp')}</p>
        </div>
        {/* The old page's segmented control rather than a row of toggle
            buttons: the chosen theme keeps the same track-wide thumb the
            settings rail uses, and the two colours it paints with are the
            `--selection` pair so a choice reads the same in both places. */}
        <RubberSegment
          aria-label={t('theme')}
          items={THEMES.map(({ value, label, icon: Icon }) => ({
            value,
            label: t(label),
            icon: <Icon size={16} aria-hidden="true" />,
          }))}
          value={theme}
          onChange={(value) => onThemeChange(value as ThemePreference)}
          thumbColor="var(--selection)"
          activeTextColor="var(--selection-foreground)"
          className="w-full outline-1 outline-border [&_[role=radio]]:focus-visible:outline-solid [&_[role=radio]]:focus-visible:outline-ring"
        />
        {themeError && <SaveFailure onRetry={onRetryTheme} />}
      </div>
    </div>
  )
}

/** A save the backend refused, with the one action the page can offer: repeat
 *  the change that was refused, now that the user has chosen to. */
function SaveFailure({ onRetry }: { onRetry: () => void }): ReactElement {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className="flex items-center gap-2 text-sm text-destructive"
    >
      <span>{t('settingsSaveFailed')}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  )
}
