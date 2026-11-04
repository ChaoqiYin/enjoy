import type { ReactElement } from 'react'
import { BrandLogo } from '../../shared/BrandLogo'
import { ShareStatusIndicator } from '../share/ShareStatusIndicator'
import { MainNav } from './MainNav'
import { SpaceSwitcher } from '../space/SpaceSwitcher'

/**
 * The top of the window: what this is, which space it is showing, and where it
 * can go.
 *
 * One row, the three clusters the old header draws: the brand and the space the
 * rest of the screen is about on the left, the entries across the middle, and
 * the share service's state on the right, where it can be read from any page.
 */
export function AppHeader({
  path,
  onSpaceSwitched,
}: {
  path: string
  onSpaceSwitched: () => void
}): ReactElement {
  return (
    <header className="z-20 shrink-0 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4">
        <div className="flex shrink-0 items-center gap-5">
          <BrandLogo />
          <SpaceSwitcher onSwitched={onSpaceSwitched} />
        </div>
        <MainNav path={path} />
        <div className="flex shrink-0 items-center gap-3">
          <ShareStatusIndicator />
        </div>
      </div>
    </header>
  )
}
