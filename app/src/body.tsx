/* Space Grotesk, self-hosted — the drawings ask for the whole family and the
   alternatives in the prototype (Manrope, JetBrains Mono) were CDN links we do
   not take. Only the latin subsets are imported: the family carries no CJK
   coverage, so Chinese text falls through to the system stack either way and
   the other subsets would ship glyphs this UI never renders.

   These are imported here rather than from the Tailwind source sheet because
   that sheet is compiled by the CLI ahead of Vite, into a file next to it: the
   `./files/…` urls `@fontsource` writes would land there unresolved instead of
   being emitted as assets. Imported from a module, Vite rewrites them. */
import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-600.css'
import '@fontsource/space-grotesk/latin-700.css'
import './styles.css'
import './shared/i18n'
import { useLayoutEffect, useMemo, useState, type ReactElement } from 'react'
import { useRuntime } from 'cordis-app/client'
import { navigate, usePath } from 'cordis-app/ui'
import { useTranslation } from 'react-i18next'
import { createRuntimeServices, ServicesProvider } from './shared/services'
import { ToastProvider } from './shared/toast'
import { useWindowTitle } from './shared/native'
import { applyTheme, storedTheme } from './shared/theme'
import { AppFooter } from './shared/AppFooter'
import { AppHeader } from './features/layout/AppHeader'
import { ScanDialogHost } from './features/scan/ScanDialogHost'
import { FavoritesPage } from './pages/FavoritesPage'
import { LibraryPage } from './pages/LibraryPage'
import { PluginsPage } from './pages/PluginsPage'
import { SettingsPage } from './pages/SettingsPage'

// Paint the stored preference before React's first frame, so every route
// starts in the theme the user last chose rather than the default palette.
applyTheme(storedTheme())

/**
 * Paint it again once the body is mounted. The shell's entry restores its own
 * appearance after importing this body — `restoreAppearance()` runs inside the
 * framework's boot sequence, which is after this module's top-level statements
 * — and that call removes `data-theme` when the shell's preference is `auto`.
 * Re-applying before the browser paints is what keeps the body in the theme
 * the user chose instead of the shell's.
 */
function useBodyTheme(): void {
  useLayoutEffect(() => {
    applyTheme(storedTheme())
  }, [])
}

/**
 * Project body: its own header, navigation and pages, and none of the
 * framework's plugin outlets, slots or settings panel.
 *
 * The column is the old window's — the dot grid behind the whole thing, the
 * header at the top, the page in the height left, the footer along the bottom.
 * The window's title bar is the platform's here: the shell opens a decorated
 * window rather than the Tauri build's frameless one, so drawing a second strip
 * would give the window two.
 *
 * A space switch remounts the routes through `spaceRevision`: the listing
 * hooks read the current space on mount, and remounting is what makes them read
 * the one that is now current without threading a space context through every
 * page.
 */
export default function Body(): ReactElement {
  useBodyTheme()
  const runtime = useRuntime()
  const path = usePath()
  const services = useMemo(() => createRuntimeServices(runtime), [runtime])
  const [spaceRevision, setSpaceRevision] = useState(0)
  const port = window.location.port === '' ? null : Number(window.location.port)

  return (
    <ServicesProvider value={services}>
      <ToastProvider>
        <WindowTitle />
        <div className="dot-grid flex h-full flex-col overflow-hidden bg-background text-foreground">
          <AppHeader
            path={path}
            onSpaceSwitched={() => setSpaceRevision((value) => value + 1)}
          />
          <div key={spaceRevision} className="flex min-h-0 flex-1 flex-col">
            {renderRoute(path)}
          </div>
          <AppFooter port={port} hardwareAcceleration={null} />
        </div>
        <ScanDialogHost />
      </ToastProvider>
    </ServicesProvider>
  )
}

/** The desktop title; a browser answers `unsupported` and this is silent. */
function WindowTitle(): null {
  useWindowTitle('Enjoy')
  return null
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
