import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Layers, Palette } from 'lucide-react'
import { Alert, AlertDescription } from '../shared/ui/alert'
import { errorTranslationKey } from '../shared/errorText'
import { setLanguage } from '../shared/i18n'
import { useServices } from '../shared/services'
import {
  applyTheme,
  normalizeTheme,
  storedTheme,
  type ThemePreference,
} from '../shared/theme'
import { ScrollViewport } from '../shared/ScrollViewport'
import {
  AppearanceSection,
  type Language,
} from '../features/settings/AppearanceSection'
import { FoldersSection } from '../features/settings/FoldersSection'
import { RepositoryLink } from '../features/settings/RepositoryLink'
import { SettingsSection } from '../features/settings/SettingsSection'
import {
  SettingsSidebar,
  type SettingsEntry,
} from '../features/settings/SettingsSidebar'
import { SpacesSection } from '../features/settings/SpacesSection'
import { useSettingsData } from '../features/settings/useSettingsData'
import { PageFrame } from '../features/layout/PageFrame'

type SettingsPanel = 'appearance' | 'spaces' | 'folders'

function normalizeLanguage(value: unknown): Language {
  return value === 'en' ? 'en' : 'zh-CN'
}

/**
 * `/settings` — the application's preferences, laid out the way the old page
 * put them: a rail of sections down the left and the one that is chosen on the
 * right as a stack of cards.
 *
 * The two columns are squared off against the window rather than the page: the
 * frame around this is the height that is left once the header and footer have
 * taken theirs, and only the right column scrolls within it. The rail stays put
 * because moving it is what the reader came here to do.
 *
 * The page draws no title of its own. The header's navigation already names
 * this page and marks it as the one on screen, so a title here would be a
 * second thing saying the same and would push the rail down out of line with
 * what it chooses between.
 */
export function SettingsPage(): ReactElement {
  const { api, scanEvents } = useServices()
  const { t, i18n } = useTranslation()
  const data = useSettingsData(api, scanEvents)
  const [panel, setPanel] = useState<SettingsPanel>('appearance')
  const [language, setLanguageState] = useState<Language>(() =>
    normalizeLanguage(i18n.language),
  )
  const [theme, setThemeState] = useState<ThemePreference>(storedTheme)
  const [saveErrors, setSaveErrors] = useState({
    language: false,
    theme: false,
  })

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false
    void api
      .getSettings()
      .then((settings) => {
        if (cancelled) return
        const stored = normalizeLanguage(settings.language)
        setLanguageState(stored)
        if (stored !== normalizeLanguage(i18n.language)) void setLanguage(stored)
        const nextTheme = normalizeTheme(settings.theme ?? storedTheme())
        setThemeState(nextTheme)
        applyTheme(nextTheme)
      })
      .catch(() => {
        // A failed read leaves the interface as it was drawn.
      })
    return () => {
      cancelled = true
    }
  }, [api, i18n])

  const changeLanguage = (value: Language): void => {
    setLanguageState(value)
    void setLanguage(value)
    // The switch applies immediately; only the write can fail, and the
    // section shows that failure next to the control that caused it.
    void api
      .putSettings({ language: value })
      .then(() => setSaveErrors((errors) => ({ ...errors, language: false })))
      .catch(() => setSaveErrors((errors) => ({ ...errors, language: true })))
  }

  const changeTheme = (value: ThemePreference): void => {
    setThemeState(value)
    applyTheme(value)
    void api
      .putSettings({ theme: value })
      .then(() => setSaveErrors((errors) => ({ ...errors, theme: false })))
      .catch(() => setSaveErrors((errors) => ({ ...errors, theme: true })))
  }

  const currentSpace =
    data.spaces.find((space) => space.current) ?? data.spaces[0]

  // Rebuilt on every render, which costs nothing: the rail draws these rows and
  // holds no state that depends on their identity.
  const items: SettingsEntry[] = [
    {
      value: 'appearance',
      label: t('settingsGeneralPanel'),
      icon: <Palette aria-hidden="true" />,
    },
    {
      value: 'spaces',
      label: t('spaces'),
      icon: <Layers aria-hidden="true" />,
    },
    {
      value: 'folders',
      label: t('settingsFolders'),
      icon: <FolderOpen aria-hidden="true" />,
      // What the entry has to report about itself: how many folders this space
      // is indexed from, and nothing when there are none.
      badge: data.directories.length > 0 ? data.directories.length : undefined,
    },
  ]

  return (
    <PageFrame>
      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        <div className="shrink-0 lg:w-64">
          <SettingsSidebar
            value={panel}
            onSelect={(value) => setPanel(value as SettingsPanel)}
            items={items}
          />
        </div>
        <ScrollViewport className="min-h-0 flex-1 space-y-6">
          {data.error !== null && (
            <Alert variant="destructive">
              <AlertDescription>
                {t(errorTranslationKey(data.error))}
              </AlertDescription>
            </Alert>
          )}
          {data.info !== null && (
            <Alert variant="info">
              <AlertDescription>{t(data.info)}</AlertDescription>
            </Alert>
          )}

          {panel === 'appearance' && (
            <SettingsSection
              icon={Palette}
              title={t('settingsGeneralPanel')}
              // The way out to the source, in the heading row: it belongs to
              // the block as a whole rather than to any one control in it.
              action={<RepositoryLink />}
            >
              <AppearanceSection
                language={language}
                theme={theme}
                languageError={saveErrors.language}
                themeError={saveErrors.theme}
                onLanguageChange={changeLanguage}
                onThemeChange={changeTheme}
                onRetryLanguage={() => changeLanguage(language)}
                onRetryTheme={() => changeTheme(theme)}
              />
            </SettingsSection>
          )}

          {panel === 'spaces' && (
            <SettingsSection icon={Layers} title={t('spaces')}>
              <SpacesSection
                spaces={data.spaces}
                scanning={data.scanning}
                busy={data.busy}
                error={data.error}
                onCreate={data.createSpace}
                onRename={data.renameSpace}
                onDelete={data.removeSpace}
                onClearError={data.clearNotice}
              />
            </SettingsSection>
          )}

          {panel === 'folders' && (
            // Named after the space it belongs to, because it does not belong
            // to the application: each space has its own directories, and this
            // is the list of one of them.
            <SettingsSection
              icon={FolderOpen}
              title={t('foldersInSpace', { name: currentSpace?.name ?? '' })}
              description={t('settingsFoldersHelp')}
            >
              <FoldersSection
                directories={data.directories}
                scanning={data.scanning}
                busy={data.busy}
                onAdd={data.addDirectories}
                onRemove={data.removeDirectory}
                onScan={data.startScan}
                onRebuild={data.rebuildThumbnails}
              />
            </SettingsSection>
          )}
        </ScrollViewport>
      </div>
    </PageFrame>
  )
}
