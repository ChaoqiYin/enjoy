import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '../shared/ui/tabs';

/// The five places the interface goes, in the order the prototype lists them.
/// The label is the translation key rather than the words, so the list is read
/// once and the words come from the language the user picked.
const entries = [
  { to: '/', label: 'library' },
  { to: '/favorites', label: 'favorites' },
  { to: '/history', label: 'history' },
  { to: '/share', label: 'sharing' },
  { to: '/settings', label: 'settings' },
] as const;

/**
 * Where the interface can go, and which of those places is on screen.
 *
 * The strip is the `Tabs` primitive's, which is the underline the prototype
 * draws under the current entry, and the entries are `NavLink`s through
 * `asChild` — so what wears that styling is the anchor itself rather than a
 * button beside it, each entry navigates by its own `href`, and the page it is
 * is on the entry as `aria-current`. Radix reads the current entry off the
 * route for the underline; the two never disagree because both are the same
 * `pathname`.
 *
 * The row is always shown, unlike the prototype's `hidden md:flex`: the narrow
 * width's substitute for it does not exist yet, and a navigation that is hidden
 * with nothing behind it is one the window cannot be used from.
 */
export function MainNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <nav aria-label={t('nav')} className="flex h-full flex-1">
      <Tabs value={pathname} className="h-full">
        <TabsList className="h-full w-auto gap-2 border-0 data-[orientation=horizontal]:border-b-0">
          {entries.map((entry) => (
            <MainNavItem
              key={entry.to}
              to={entry.to}
              label={t(entry.label)}
              isActive={pathname === entry.to}
            />
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}

/**
 * One entry: where it goes, what it is called, and whether this is the place.
 *
 * `isActive` is passed rather than read from the route here because the entry
 * is the last thing that knows it is a route — the words a reader is given and
 * the mark that says *this one* both come from it.
 */
export function MainNavItem({
  to,
  label,
  isActive,
}: {
  to: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <TabsTrigger asChild value={to}>
      <NavLink
        to={to}
        end
        aria-current={isActive ? 'page' : undefined}
        className="h-full px-3"
      >
        {label}
      </NavLink>
    </TabsTrigger>
  );
}
