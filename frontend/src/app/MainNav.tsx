import { motion, useReducedMotion } from 'motion/react';
import { Clapperboard, Heart, History, Settings, Share2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '../shared/ui/tabs';

/// The five places the interface goes, in the order the prototype lists them.
/// The label is the translation key rather than the words, so the list is read
/// once and the words come from the language the user picked.
///
/// Each entry carries the icon that stands before its words as well. The
/// prototype's header is words alone, so this is an addition rather than a
/// restoration, and the record for it is ADR 0024. Two of the five are the
/// icons the app already draws for the same meaning — `Heart` is the favourite
/// control on a video card, `Share2` is the "shared" badge — because a second
/// icon for a meaning already drawn is a second thing to learn. The rest of the
/// set, and why the view-mode icons (`LayoutGrid` / `List` / `Table`), `Clock`
/// and `Play` were left where they are, is there too.
const entries = [
  { to: '/', label: 'library', icon: Clapperboard },
  { to: '/favorites', label: 'favorites', icon: Heart },
  { to: '/history', label: 'history', icon: History },
  { to: '/share', label: 'sharing', icon: Share2 },
  { to: '/settings', label: 'settings', icon: Settings },
] as const;

/**
 * Where the interface can go, and which of those places is on screen.
 *
 * The strip is the `Tabs` primitive's and the entries are `NavLink`s through
 * `asChild` — so what wears that styling is the anchor itself rather than a
 * button beside it, each entry navigates by its own `href`, and the page it is
 * is on the entry as `aria-current`. The line the prototype draws under the
 * current entry is this file's rather than the primitive's, because it slides
 * between entries: `MainNavItem` has the route and says why.
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
              icon={entry.icon}
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
 * the mark that says *this one* both come from it. And that mark is why the
 * line is drawn here rather than by the primitive: it slides from the entry
 * that had it to the entry that has it, so it has to exist on one entry at a
 * time and be shared between them, and only a component that knows which entry
 * is current can render it. Radix keeps that in `data-state`, on the DOM.
 *
 * `layoutId` is what makes it slide: Motion treats the two elements — one
 * unmounting, one mounting, in the same commit — as the same element moved, and
 * animates the distance instead of cutting. Under the reduced-motion preference
 * it is given no `layoutId` at all, so the line arrives in place; the app's
 * `MotionConfig` is not enough on its own, for the reason `VideoCard` records.
 * The 2px and the primary colour are what the primitive's own underline wore,
 * so the line has not moved or resized, only learned to travel — and the 2px is
 * written as a pixel because the root font size is 14px, where the `0.5` step
 * that would be the natural spelling comes out at 1.75.
 *
 * The icon is decoration and says so: the entry is named by its words, and the
 * words are the name of the place. `aria-hidden` and `pointer-events-none` are
 * the guide's rule for a leading icon, and here they also hold the accessible
 * name to the label alone — the entries are found by that name, by a reader and
 * by the header's tests. `shrink-0` because this strip carries none of the
 * `[&_svg]` rules the buttons and badges do, and a squeezed icon is a distorted
 * one. The space between it and the words is the trigger's own `gap-1.5`, which
 * has been sitting there unused.
 */
export function MainNavItem({
  to,
  label,
  icon: Icon,
  isActive,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <TabsTrigger asChild value={to}>
      <NavLink
        to={to}
        end
        aria-current={isActive ? 'page' : undefined}
        className="relative h-full px-3"
      >
        <Icon
          size={14}
          aria-hidden="true"
          className="pointer-events-none shrink-0"
        />
        {label}
        {isActive && (
          <motion.span
            aria-hidden="true"
            layoutId={reduceMotion ? undefined : 'main-nav-underline'}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-x-0 bottom-0 h-[2px] bg-primary"
          />
        )}
      </NavLink>
    </TabsTrigger>
  );
}
