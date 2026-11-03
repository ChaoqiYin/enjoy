/**
 * Second server entry: the scan thread.
 *
 * The project build turns every top-level `server/*.ts` entry besides `index`
 * into `dist/server/<name>.js`, so this file lands next to `index.js` and can be
 * loaded with `new URL('./scan-worker.js', import.meta.url)`.
 */

import { startScanWorker } from './scan/worker.ts'

startScanWorker()
