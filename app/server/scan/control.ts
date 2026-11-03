/**
 * Pause and cancel checkpoints.
 *
 * The main thread writes the control word and notifies; the scan thread parks
 * on `Atomics.wait` until the word changes. A checkpoint is cheap enough to run
 * once per directory entry, which is the finest step discovery has.
 */

import { CONTROL } from './types.ts'

export class ScanCancelled extends Error {
  constructor() {
    super('scan cancelled')
    this.name = 'ScanCancelled'
  }
}

export class ScanControl {
  private readonly cell: Int32Array

  constructor(buffer: SharedArrayBuffer) {
    this.cell = new Int32Array(buffer)
  }

  /** Throw when cancelled, block while paused, return when running. */
  checkpoint(): void {
    const value = Atomics.load(this.cell, 0)
    if (value === CONTROL.cancel) throw new ScanCancelled()
    if (value === CONTROL.pause) this.waitWhilePaused()
  }

  private waitWhilePaused(): void {
    for (;;) {
      Atomics.wait(this.cell, 0, CONTROL.pause)
      const value = Atomics.load(this.cell, 0)
      if (value === CONTROL.cancel) throw new ScanCancelled()
      if (value !== CONTROL.pause) return
    }
  }
}
