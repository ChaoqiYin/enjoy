import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { BrandLogo } from '../shared/BrandLogo';
import { SpaceSwitcher } from '../features/space/SpaceSwitcher';
export function AppNavigation() {
  const { t } = useTranslation();
  return (
    <header className="shrink-0 z-20 bg-base-100 border-b border-base-300 p-4 flex flex-wrap items-center gap-4">
      <BrandLogo />
      <SpaceSwitcher />
      <nav className="tabs tabs-border" aria-label={t('nav')}>
        {[
          ['/', t('library')],
          ['/favorites', t('favorites')],
          ['/history', t('history')],
          ['/settings', t('settings')],
        ].map(([path, label]) => (
          <NavLink
            key={path}
            to={path}
            end
            className={({ isActive }) =>
              `tab font-semibold ${isActive ? 'tab-active text-primary' : ''}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
