import { MotionConfig } from 'motion/react';
import { Navigate, Route, Routes } from 'react-router';
import { LanguageFocusSync } from '../i18n/LanguageSetting';
import { LibraryProvider } from '../features/library/LibraryProvider';
import { UpdateProvider } from '../features/update/UpdateProvider';
import { LibraryPage } from '../pages/LibraryPage';
import { FavoritesPage } from '../pages/FavoritesPage';
import { HistoryPage } from '../pages/HistoryPage';
import { SettingsPage } from '../pages/SettingsPage';
import { AppNavigation } from './AppNavigation';
import { SettingsProvider } from '../settings/SettingsProvider';
import { SpaceProvider } from '../features/space/SpaceProvider';
import type { Space } from '../shared/api';

export function App({ initialSpace }: { initialSpace: Space }) {
  // Reading the reduced-motion preference is the app-level provider's job — one
  // provider covers every page, since the library, favourites and history all
  // render the one card; the card's own transform targets are documented where
  // they are declared.
  return (
    <MotionConfig reducedMotion="user">
      <SettingsProvider>
        {/* Outside the library provider: the library is read and written within
            a space, so the space has to be known before it is asked for. */}
        <SpaceProvider initialSpace={initialSpace}>
          <LibraryProvider>
            {/* Inside the library provider: the update flow asks it whether a
                scan is running before it interrupts one. */}
            <UpdateProvider>
              <div className="h-dvh overflow-hidden flex flex-col bg-base-100 text-base-content">
                <LanguageFocusSync />
                <AppNavigation />
                <Routes>
                  <Route path="/" element={<LibraryPage />} />
                  <Route path="/favorites" element={<FavoritesPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </UpdateProvider>
          </LibraryProvider>
        </SpaceProvider>
      </SettingsProvider>
    </MotionConfig>
  );
}
