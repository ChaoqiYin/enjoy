/** Library backend: SQLite data layer plus the space, directory and settings API. */

import { join } from 'node:path'
import type { KernelContext } from 'cordis-app/server'
import { openDatabase } from './db.ts'
import { registerRoutes } from './routes.ts'
import { LibraryStore } from './store.ts'

export interface LibraryOptions {
  /** Directory holding `library.db`. Defaults to `<project>/data`. */
  dataDir?: string
  /** Whether a scan currently owns the scan slot. Injected by the scan task. */
  isScanActive?: () => boolean
}

export function installLibrary(ctx: KernelContext, options: LibraryOptions = {}): void {
  const dataDir = options.dataDir ?? defaultDataDir()
  const db = openDatabase(join(dataDir, 'library.db'))
  const store = new LibraryStore(db)
  registerRoutes(ctx, store, {
    isScanActive: options.isScanActive ?? (() => false),
  })
  ctx.effect(() => () => db.close())
}

function defaultDataDir(): string {
  const projectRoot = process.env.CORDIS_APP_PROJECT ?? process.cwd()
  return join(projectRoot, 'data')
}
