/** Library backend: SQLite data layer plus the space, directory and settings API. */

import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { KernelContext } from 'cordis-app/server'
import { openDatabase } from './db.ts'
import { registerRoutes, type SpaceChange } from './routes.ts'
import { LibraryStore } from './store.ts'
import { registerThumbnailRoutes } from './thumbnail-routes.ts'
import { registerVideoRoutes } from './video-routes.ts'
import { VideoStore } from './videos.ts'

export interface LibraryOptions {
  /** Directory holding `library.db`. Defaults to `<project>/data`. */
  dataDir?: string
  /** Whether a scan currently owns the scan slot. Injected by the scan task. */
  isScanActive?: () => boolean
  /** Stops anything that must not outlive the current space. Injected by the server. */
  beforeSpaceChange?: (change: SpaceChange) => Promise<void>
}

export interface LibraryHandle {
  store: LibraryStore
  videos: VideoStore
  db: DatabaseSync
}

export function installLibrary(ctx: KernelContext, options: LibraryOptions = {}): LibraryHandle {
  const dataDir = options.dataDir ?? defaultDataDir()
  const db = openDatabase(join(dataDir, 'library.db'))
  const store = new LibraryStore(db)
  registerRoutes(ctx, store, {
    isScanActive: options.isScanActive ?? (() => false),
    beforeSpaceChange: options.beforeSpaceChange,
  })
  const videos = new VideoStore(db)
  registerVideoRoutes(ctx, videos, store)
  registerThumbnailRoutes(ctx, videos)
  ctx.effect(() => () => db.close())
  return { store, videos, db }
}

/** The data directory the library and the scan worker share. */
export function defaultDataDir(): string {
  const projectRoot = process.env.CORDIS_APP_PROJECT ?? process.cwd()
  return join(projectRoot, 'data')
}
