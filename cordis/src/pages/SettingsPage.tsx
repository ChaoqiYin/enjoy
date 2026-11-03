import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '../shared/ui/alert'
import { errorTranslationKey } from '../shared/errorText'
import { setLanguage } from '../shared/i18n'
import { useServices } from '../shared/services'
import {
  applyTheme,
  normalizeTheme,
  storedTheme,
  watchSystemTheme,
  type ThemePreference,
} from '../shared/theme'
import { AppearanceSection, type Language } from '../features/settings/AppearanceSection'
import { FoldersSection } from '../features/settings/FoldersSection'
import { PluginsSection } from '../features/settings/PluginsSection'
import { SpacesSection } from '../features/settings/SpacesSection'
import { useSettingsData } from '../features/settings/useSettingsData'

function normalizeLanguage(value: unknown): Language {
  return value === 'en' ? 'en' : 'zh-CN'
}

/** `/settings` — appearance, spaces, folders and the read-only plugin block. */
export function SettingsPage(): ReactElement {
  const { api, scanEvents } = useServices()
  const { t, i18n } = useTranslation()
  const data = useSettingsData(api, scanEvents)
  const [language, setLanguageState] = useState<Language>(() =>
    normalizeLanguage(i18n.language),
  )
  const [theme, setThemeState] = useState<ThemePreference>(storedTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    return watchSystemTheme(() => applyTheme('system'))
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
    void api.putSettings({ language: value }).catch(() => {
      // The switch already happened; the section owns the failure notice.
    })
  }

  const changeTheme = (value: ThemePreference): void => {
    setThemeState(value)
    applyTheme(value)
    void api.putSettings({ theme: value }).catch(() => {
      // Same as language: the document already changed.
    })
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold">{t('settings')}</h1>

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

      <AppearanceSection
        language={language}
        theme={theme}
        onLanguageChange={changeLanguage}
        onThemeChange={changeTheme}
      />

      <SpacesSection
        spaces={data.spaces}
        scanning={data.scanning}
        busy={data.busy}
        onCreate={data.createSpace}
        onRename={data.renameSpace}
        onDelete={data.removeSpace}
        onSwitch={data.switchSpace}
      />

      <FoldersSection
        directories={data.directories}
        scanning={data.scanning}
        busy={data.busy}
        onAdd={data.addDirectories}
        onRemove={data.removeDirectory}
        onScan={data.startScan}
        onRebuild={data.rebuildThumbnails}
      />

      <PluginsSection />
    </section>
  )
}
