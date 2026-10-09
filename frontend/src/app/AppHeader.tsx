import { BrandLogo } from '../shared/BrandLogo';
import { ShareStatusPill } from '../shared/ShareStatusPill';
import { SpaceSwitcher } from '../features/space/SpaceSwitcher';
import { useShareContext } from '../features/share/ShareProvider';
import { MainNav } from './MainNav';

/**
 * The top of the window: what this is, which space it is showing, where it can
 * go, and whether the service is up.
 *
 * One row, the three clusters the prototype draws: the brand and the space the
 * rest of the screen is about on the left, the entries across the middle, the
 * sharing state on the right. The sharing state hangs here rather than on the
 * entry it is about because it is a fact about the window, not about the page
 * the entry goes to — the same reason the space is named here.
 */
export function AppHeader() {
  const share = useShareContext();
  return (
    <header className="z-20 shrink-0 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4">
        <div className="flex shrink-0 items-center gap-5">
          <BrandLogo />
          <SpaceSwitcher />
        </div>
        <MainNav />
        <div className="flex shrink-0 items-center gap-3">
          <ShareStatusPill running={share.port !== null} port={share.port} />
        </div>
      </div>
    </header>
  );
}
