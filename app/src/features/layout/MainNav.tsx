import { Fragment, type ReactElement } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  Clapperboard,
  Heart,
  Puzzle,
  Settings,
  Share2,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { navigate } from 'cordis-app/ui'
import { Tabs, TabsList, TabsTrigger } from '../../shared/ui/tabs'

/** The places this version has, in the old interface's order. */
const entries = [
  { to: '/', label: 'library', icon: Clapperboard },
  { to: '/favorites', label: 'favorites', icon: Heart },
  { to: '/share', label: 'sharePage', icon: Share2 },
  { to: '/settings', label: 'settings', icon: Settings },
  { to: '/plugins', label: 'plugins', icon: Puzzle },
] as const

/** How far apart two characters start their turn, and the ceiling on the whole
 *  stagger — the old header's numbers, kept so the hover wave reads the same. */
const STAGGER_MS = 30
const STAGGER_CAP_MS = 240

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function splitLabel(label: string) {
  const pieces: { text: string; order: number | null }[] = []
  let order = 0
  for (const { segment } of segmenter.segment(label)) {
    if (segment.trim() === '') {
      pieces.push({ text: segment, order: null })
      continue
    }
    pieces.push({ text: segment, order })
    order += 1
  }
  return {
    pieces,
    step: order < 2 ? 0 : Math.min(STAGGER_MS, STAGGER_CAP_MS / (order - 1)),
  }
}

/**
 * Where the interface can go, and which of those places is on screen.
 *
 * The strip is the `Tabs` primitive's, as the old header used it, so the entry
 * that is current is marked by a 2px line that slides between entries rather
 * than cut. The row is always shown: hiding it at a narrow width with nothing
 * in its place would leave the window unusable.
 */
export function MainNav({ path }: { path: string }): ReactElement {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('nav')} className="flex h-full flex-1">
      <Tabs value={path} className="h-full">
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
              isActive={path === entry.to}
            />
          ))}
        </TabsList>
      </Tabs>
    </nav>
  )
}

function MainNavItem({
  to,
  label,
  icon: Icon,
  isActive,
}: {
  to: string
  label: string
  icon: LucideIcon
  isActive: boolean
}): ReactElement {
  const reduceMotion = useReducedMotion()
  const split = reduceMotion ? null : splitLabel(label)
  return (
    <TabsTrigger
      asChild
      value={to}
      className="focus-visible:ring-0 focus-visible:ring-offset-0"
    >
      <button
        type="button"
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => navigate(to)}
        className="group relative h-full px-3"
      >
        <Icon
          size={14}
          aria-hidden="true"
          className="pointer-events-none shrink-0"
        />
        <span className="nav-words min-w-max overflow-hidden whitespace-nowrap">
          {split
            ? split.pieces.map((piece, i) =>
                piece.order === null ? (
                  <Fragment key={i}>{piece.text}</Fragment>
                ) : (
                  <span
                    key={i}
                    className="nav-char group-hover:animate-nav-turn inline-block"
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
      </button>
    </TabsTrigger>
  )
}
