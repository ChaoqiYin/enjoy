import type { KernelContext } from 'cordis-app/server'
import { defaultDataDir, installLibrary } from './library/index.ts'
import type { ScanController } from './scan/index.ts'
import { installScan } from './scan/index.ts'
import { installShare, type ShareController } from './share/control.ts'

import { registerNativeRoutes } from './native/index.ts'
import { installPlugins } from './plugins/index.ts'

/**
 * Project backend entry.
 *
 * The worker calls the default export after built-in plugins and before
 * application plugins. It is not an application plugin: there is no
 * plugin.json and it cannot be installed or removed.
 */
export default function apply(ctx: KernelContext): void {
  const dataDir = defaultDataDir()
  // The scan slot reads from the library; the library asks the slot whether a
  // scan is using it, and asks the share slot to stop before the current space
  // changes. The holder breaks the construction cycle without making either
  // side a singleton.
  const holder: { scan?: ScanController; share?: ShareController } = {}
  const library = installLibrary(ctx, {
    dataDir,
    isScanActive: () => holder.scan?.isActive() ?? false,
    beforeSpaceChange: (change) => holder.share?.beforeSpaceChange(change) ?? Promise.resolve(),
  })
  holder.scan = installScan(ctx, { store: library.store, dataDir })
  holder.share = installShare(ctx, { store: library.store, videos: library.videos })
  registerNativeRoutes(ctx)
  installPlugins(ctx)
}
