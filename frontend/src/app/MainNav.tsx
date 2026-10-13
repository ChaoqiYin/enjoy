import { Fragment } from 'react';
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

/// How far apart two characters start their turn, and the ceiling on the whole
/// stagger.
///
/// One turn is most of half a second (`--animate-nav-turn`), so the stagger is
/// what decides how long the label spends being turned rather than being read.
/// The gap is the short label's: "收藏" is two characters and 30ms apart they
/// read as one movement, not as two. The ceiling is the long label's —
/// "Recently played" is fourteen drawn characters, and at a flat 30ms the last
/// of them would not start until 0.39s, so the label would be turning for the
/// better part of a second every time a pointer crossed it. Nothing here is
/// hidden while a character waits its turn (no fill mode: a character that has
/// not started is the plain label), which is what makes a long stagger
/// affordable at all — the waiting characters are the label, and the wave never
/// takes the whole of it at once.
const STAGGER_MS = 30;
const STAGGER_CAP_MS = 240;

/// Grapheme clusters rather than code points, so a character carrying a
/// combining mark stays one piece — spread apart, the mark would be drawn in a
/// box of its own with nothing under it.
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * A label as the pieces the hover effect turns: one per character, in the order
 * they go, with the spaces between words left as pieces of their own.
 *
 * The spaces are drawn as plain text rather than in a span — they must not
 * turn, and they must not be clipped by the mask the characters slide under.
 * They are also left out of the count, so the characters keep a steady rhythm
 * across a word boundary, and they carry `null` to say so. The step is capped
 * so a long label finishes quickly (`STAGGER_MS`), and is zero for a label of
 * one character, which has nothing to be staggered against.
 */
function splitLabel(label: string) {
  const pieces: { text: string; order: number | null }[] = [];
  let order = 0;
  for (const { segment } of segmenter.segment(label)) {
    if (segment.trim() === '') {
      pieces.push({ text: segment, order: null });
      continue;
    }
    pieces.push({ text: segment, order });
    order += 1;
  }
  return {
    pieces,
    step: order < 2 ? 0 : Math.min(STAGGER_MS, STAGGER_CAP_MS / (order - 1)),
  };
}

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
 *
 * The row is out of the keyboard's order. Radix's tab stop for a strip is the
 * list itself and not any entry — every trigger is `tabIndex={-1}` on its own,
 * which is why the `-1` here looks pointless and is not: it lands on `TabsList`.
 * The cost is stated rather than implied: the keyboard cannot reach this row at
 * all. It is the mouse's way in, the entries are marked with `aria-current` for
 * a reader, and the ring that would say where the keyboard is has nowhere to
 * stand because the keyboard does not go there; `MainNavItem` says the rest.
 */
export function MainNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <nav aria-label={t('nav')} className="flex h-full flex-1">
      <Tabs value={pathname} className="h-full">
        <TabsList
          tabIndex={-1}
          className="h-full w-auto gap-2 border-0 data-[orientation=horizontal]:border-b-0"
        >
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
 * The icon is decoration and says so: the entry is named by its label, and the
 * label is the name of the place. `aria-hidden` and `pointer-events-none` are
 * the guide's rule for a leading icon, and here they also hold the accessible
 * name to the label alone — the entries are found by that name, by a reader and
 * by the header's tests. `shrink-0` because this strip carries none of the
 * `[&_svg]` rules the buttons and badges do, and a squeezed icon is a distorted
 * one. The space between it and the words is the trigger's own `gap-1.5`, which
 * has been sitting there unused.
 *
 * The words are wrapped in a layer, and inside it each character is a span of
 * its own, so that a character can be turned — lifted toward the top of the
 * label and set back down into its own place — one at a time while the pointer
 * is on the entry (`.nav-char`, `--animate-nav-turn`, and ADR 0027 for why the
 * effect is a token in `style.css` rather than a component here).
 *
 * That layer is load-bearing rather than cosmetic. The trigger is a flex row
 * with `gap-1.5`, and characters left as its own children would each be a flex
 * item — the gap would open six pixels between every letter, and the space in
 * an English label, being a whitespace-only anonymous item, would be dropped
 * altogether: "Recently played" would read "Recentlyplayed". Held inside one
 * layer the label is still one flex item and `gap-1.5` is still the distance to
 * the icon. The layer must not become a flex box itself, for the same reason.
 *
 * A character has to be `inline-block` to be movable at all: a transform does
 * not apply to a non-replaced inline box, which is what a bare span is. That is
 * a cost paid at rest and not only while the effect runs — each character is
 * shaped in a box of its own, so kerning and ligatures between characters are
 * lost. None of today's labels show it (no `fi`/`fl` pair is among them, and
 * Space Grotesk kerns nothing that appears), but the labels come from
 * `shared/locales`, and a language added later can bring "Files"
 * or "Profile" in with it. What the fixed boxes buy is what this effect needs:
 * hovering reflows nothing, because the boxes are already there.
 * `whitespace-nowrap` holds the other half of today's behaviour: atomic inline
 * boxes may be broken between, so without it a squeezed entry would split a
 * word where it now overflows whole.
 *
 * The layer clips, and that clip is the effect rather than tidiness: the top of
 * a character's glyph is carried past the top of the line box at the peak of its
 * turn, so without it the upper half would be painted over the strip and over
 * whatever the header is sitting on. The clip
 * goes on the layer and not on the character, which is the one place it cannot:
 * an inline-block's baseline is its last line box's only while overflow is
 * visible, so a character that clipped would drop the row by half a line. The
 * layer can afford it because the trigger is `items-center` — a flex item's
 * baseline is never asked for here. What the clip costs is the floor under the
 * layer's width: a flex item has an automatic minimum size only while its
 * overflow is visible, so this one could be squeezed to nothing and have its
 * words cut off mid-word, where a squeezed entry today keeps its words whole and
 * lets the row overflow. `min-w-max` is that floor, put back by hand.
 *
 * The label also names the entry through `aria-label` now, and that is a
 * concession worth stating rather than burying. The entries are found by their
 * accessible name, and the name algorithm puts a space on either side of every
 * element child that is not `inline` — so per-character spans would name this
 * entry "L i b r a r y" for a reader and in the header's tests. The attribute is
 * handed the same `label`, so the name is still those words and the icon is
 * still outside it; what moved is where the name comes from. It goes on the
 * anchor and not on the layer: `aria-label` on a role=generic `span` is
 * prohibited — jsdom would pass it and a screen reader would ignore it, which
 * is the worst kind of green.
 *
 * `group` sits on the entry rather than on a character, for two reasons that
 * come to the same thing: the hover target is the whole entry — the pointer is
 * on the icon and the padding as much as on the letters, and characters that
 * only moved while the pointer was over the glyphs would look like a miss — and
 * it is that class the utility is gated on.
 *
 * Under the reduced-motion preference the layer holds plain words and no
 * characters at all, so the effect is absent rather than still — the rule ADR
 * 0008 set for decoration, and the reason the branch is here rather than a
 * `motion-reduce:` variant: this component already reads the preference for the
 * line below, and one component keeps one source for it. What that costs is
 * stated rather than implied: a reader who asks the system for less motion
 * never sees a character turn, not even once.
 *
 * The entry takes the primitive's focus ring off. Radix focuses the entry from
 * `mousedown` and Chromium reads a script's `focus()` as keyboard focus, so the
 * ring meant for the keyboard is drawn on every click — a box on the row that
 * is supposed to have none. The two classes go through `TabsTrigger`'s own
 * `className` rather than the anchor's because `cn` merges them there, over the
 * primitive's `ring-2`; put on the anchor they would sit *beside* the
 * primitive's and the winner would come down to the order Tailwind emitted the
 * two in. The `outline-none` the request also names is already the primitive's,
 * so there is nothing to add for it. What removing the ring costs the keyboard
 * is `MainNav`'s to say, and it says it.
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
  const split = reduceMotion ? null : splitLabel(label);
  return (
    <TabsTrigger
      asChild
      value={to}
      className="focus-visible:ring-0 focus-visible:ring-offset-0"
    >
      <NavLink
        to={to}
        end
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        className="group relative h-full px-3"
      >
        <Icon
          size={14}
          aria-hidden="true"
          className="pointer-events-none shrink-0"
        />
        <span className="nav-words overflow-hidden min-w-max whitespace-nowrap">
          {split
            ? split.pieces.map((piece, i) =>
                piece.order === null ? (
                  <Fragment key={i}>{piece.text}</Fragment>
                ) : (
                  <span
                    key={i}
                    className="nav-char inline-block group-hover:animate-nav-turn"
                    style={{ animationDelay: `${piece.order * split.step}ms` }}
                  >
                    {piece.text}
                  </span>
                ),
              )
            : label}
        </span>
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
