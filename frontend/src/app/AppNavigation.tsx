import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { BrandLogo } from '../shared/BrandLogo';
import { useLibraryContext } from '../features/library/LibraryProvider';
export function AppNavigation() {
  const { t, i18n } = useTranslation();
  const status = useLibraryContext().scan.data;
  const scanning =
    status && ['discovering', 'processing', 'paused'].includes(status.phase);
  return (
    <header className="shrink-0 z-20 bg-base-100 border-b border-base-300 p-4 flex flex-wrap items-center gap-4">
      <BrandLogo />
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
      {scanning && (
        <span role="status" className="text-sm tabular-nums">
          {status.phase === 'paused' ? t('paused') : t('scanning')}
          {status.discovered > 0 && (
            <>
              {' '}
              ·{' '}
              {new Intl.NumberFormat(i18n.language, {
                style: 'percent',
                maximumFractionDigits: 0,
              }).format(Math.min(1, status.processed / status.discovered))}
            </>
          )}
        </span>
      )}
    </header>
  );
}
