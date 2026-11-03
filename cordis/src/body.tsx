import './styles.css'
import './shared/i18n'
import { useMemo, type ReactElement } from 'react'
import { useRuntime } from 'cordis-app/client'
import { navigate, usePath } from 'cordis-app/ui'
import { Clapperboard, Heart, Puzzle, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from './shared/cn'
import { createRuntimeServices, ServicesProvider } from './shared/services'
import { applyTheme, storedTheme } from './shared/theme'
import { FavoritesPage } from './pages/FavoritesPage'
import { LibraryPage } from './pages/LibraryPage'
import { PluginsPage } from './pages/PluginsPage'
import { SettingsPage } from './pages/SettingsPage'

// Paint the stored preference before React's first frame, so every route
// starts in the theme the user last chose rather than the default palette.
applyTheme(storedTheme())

const ROUTES = [
  { path: '/', label: 'library', icon: Clapperboard },
  { path: '/favorites', label: 'favorites', icon: Heart },
  { path: '/plugins', label: 'plugins', icon: Puzzle },
  { path: '/settings', label: 'settings', icon: Settings },
] as const

/**
 * Project body: its own navigation and pages, and none of the framework's
 * plugin outlets, slots or settings panel.
 *
 * The framework still owns the window-level concerns (`BodyHost` adds the
 * shortcut listener, the context menu and the error boundary), but the layout
 * and the four routes are this project's. The plugin route is a signpost
 * because `app.json` declares no UI plugins in the first version.
 */
export default function Body(): ReactElement {
  const runtime = useRuntime()
  const path = usePath()
  const { t } = useTranslation()
  const services = useMemo(() => createRuntimeServices(runtime), [runtime])

  return (
    <ServicesProvider value={services}>
      <div className="flex h-screen bg-background text-foreground">
        <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-card p-3">
          <div className="px-2 pb-4 pt-1 text-lg font-semibold tracking-tight">
            {t('appName')}
          </div>
          <nav aria-label={t('appName')} className="flex flex-col gap-1">
            {ROUTES.map((route) => {
              const Icon = route.icon
              const active = path === route.path
              return (
                <button
                  key={route.path}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigate(route.path)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-hover',
                    active && 'bg-selection text-selection-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  {t(route.label)}
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto">{renderRoute(path)}</main>
      </div>
    </ServicesProvider>
  )
}

function renderRoute(path: string): ReactElement {
  if (path === '/') return <LibraryPage />
  if (path === '/favorites') return <FavoritesPage />
  if (path === '/plugins') return <PluginsPage />
  if (path === '/settings') return <SettingsPage />
  return <NotFound />
}

function NotFound(): ReactElement {
  const { t } = useTranslation()
  return (
    <section className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-medium">{t('notFound')}</p>
      <p className="text-sm text-muted-foreground">{t('library')}</p>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        {t('library')}
      </button>
    </section>
  )
}
