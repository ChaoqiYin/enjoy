import { MotionConfig } from 'motion/react';
import { Navigate, Route, Routes } from 'react-router';
import { LanguageFocusSync } from '../i18n/LanguageSetting';
import { LibraryProvider } from '../features/library/LibraryProvider';
import {
  ShareProvider,
  useShareContext,
} from '../features/share/ShareProvider';
import { UpdateProvider } from '../features/update/UpdateProvider';
import { LibraryPage } from '../pages/LibraryPage';
import { FavoritesPage } from '../pages/FavoritesPage';
import { HistoryPage } from '../pages/HistoryPage';
import { SharePage } from '../pages/SharePage';
import { SettingsPage } from '../pages/SettingsPage';
import { AppFooter } from '../shared/AppFooter';
import { AppHeader } from './AppHeader';
import { SettingsProvider } from '../settings/SettingsProvider';
import { SpaceProvider } from '../features/space/SpaceProvider';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import type { Space } from '../shared/api';

export function App({ initialSpace }: { initialSpace: Space }) {
  // Reading the reduced-motion preference is the app-level provider's job — one
  // provider covers every page, since the library, favourites and history all
  // render the one card; the card's own transform targets are documented where
  // they are declared.
  //
  // The boundary is outside every provider for the same reason it exists: it is
  // what the whole composition falls back to, so nothing it is meant to catch
  // may sit above it.
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <SettingsProvider>
          {/* Outside the library provider: the library is read and written
              within a space, so the space has to be known before it is asked
              for. */}
          <SpaceProvider initialSpace={initialSpace}>
            <LibraryProvider>
              {/* Inside the library provider: the update flow asks it whether a
                  scan is running before it interrupts one. */}
              <UpdateProvider>
                {/* Inside the library provider, like the update flow: the
                    service is ended by the things the library owns — leaving a
                    space, closing the window — so it sits where it can reach
                    them. */}
                <ShareProvider>
                  <Window />
                </ShareProvider>
              </UpdateProvider>
            </LibraryProvider>
          </SpaceProvider>
        </SettingsProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}

/**
 * The window itself: the header, the page the route names, and the footer.
 *
 * Apart from `App` because the footer's port is the service's, and the service
 * is only readable below the providers `App` composes — `App` names the
 * providers and this names the column they are drawn in, which is the whole of
 * the difference.
 */
function Window() {
  const share = useShareContext();
  return (
    // The dot matrix is this element's own background rather than a layer
    // inside it: `bg-background` paints the surface and `.dot-grid` paints the
    // dots over it, both under everything the column draws. That is why there
    // is no wrapper, no `z-index` and no `isolate` here — the two attempts that
    // needed them are what ADR 0022 is about.
    <div className="dot-grid flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <LanguageFocusSync />
      <AppHeader />
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/share" element={<SharePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* Nothing measured the platform's encoding for the interface yet, so
          the footer is given what is known and says the rest is not. */}
      <AppFooter port={share.port} hardwareAcceleration={null} />
    </div>
  );
}
