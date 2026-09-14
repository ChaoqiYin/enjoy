import { Navigate, Route, Routes } from 'react-router';
import { LanguageFocusSync } from '../i18n/LanguageSetting';
import { LibraryProvider } from '../features/library/LibraryProvider';
import { LibraryPage } from '../pages/LibraryPage';
import { FavoritesPage } from '../pages/FavoritesPage';
import { HistoryPage } from '../pages/HistoryPage';
import { SettingsPage } from '../pages/SettingsPage';
import { AppNavigation } from './AppNavigation';
import { SettingsProvider } from '../settings/SettingsProvider';

export function App() {
  return (
    <SettingsProvider>
      <LibraryProvider>
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
      </LibraryProvider>
    </SettingsProvider>
  );
}
