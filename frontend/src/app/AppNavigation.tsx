import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { BrandLogo } from '../shared/BrandLogo';
import { SpaceSwitcher } from '../features/space/SpaceSwitcher';
import { useShareContext } from '../features/share/ShareProvider';
export function AppNavigation() {
  const { t } = useTranslation();
  const share = useShareContext();
  const sharing = share.port !== null;
  // A lamp on the entry, and the words that go with it, in the two places words
  // are read from a lamp: under the pointer, and by a reader that has none. The
  // colour is the glance; the words are the answer, and a lamp that had only
  // the colour would be one a user has to have been told about to know.
  const indicator = t('sharingIndicator');
  return (
    <header className="shrink-0 z-20 bg-base-100 border-b border-base-300 p-4 flex flex-wrap items-center gap-4">
      <BrandLogo />
      <SpaceSwitcher />
      <nav className="tabs tabs-border" aria-label={t('nav')}>
        {[
          ['/', t('library')],
          ['/favorites', t('favorites')],
          ['/history', t('history')],
          ['/share', t('sharing')],
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
            {path === '/share' && sharing && (
              <>
                <span
                  className="inline-block size-2.5 shrink-0 rounded-full bg-success"
                  title={indicator}
                  aria-hidden="true"
                />
                <span className="sr-only">{indicator}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
