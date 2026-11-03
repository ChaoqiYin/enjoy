/**
 * The one place that decides what a native envelope means.
 *
 * `unsupported` is not an error: it is the browser build saying this machine
 * has no shell behind it. Every caller that would otherwise write
 * `code === 'unsupported'` asks this module instead, so a new degradation
 * branch cannot quietly disagree with the others.
 */

import { useCallback, useEffect, useState } from 'react'
import type { NativeResult } from './api'
import { useServices } from './services'

export type NativeOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; unsupported: boolean }

export type NativeCommand = (
  command: string,
  input: unknown,
) => Promise<NativeOutcome<unknown>>

/** Classify an envelope once, at the seam where it arrives. */
export function classifyNativeResult<T>(
  result: NativeResult<T>,
): NativeOutcome<T> {
  if (result.ok) return { ok: true, value: result.value }
  return {
    ok: false,
    code: result.code,
    message: result.message,
    unsupported: result.code === 'unsupported',
  }
}

/** Whether a failure is the browser build's normal answer, not an error. */
export function isUnsupported(
  failure: { code: string } | null | undefined,
): boolean {
  return failure?.code === 'unsupported'
}

/** The project's native seam, classified. */
export function useNativeCommand(): NativeCommand {
  const { api } = useServices()
  return useCallback(
    async (command, input) =>
      classifyNativeResult(await api.native(command, input)),
    [api],
  )
}

/**
 * Whether a desktop shell answers.
 *
 * `window.state` is the probe because it is on the proxy's allowlist and has no
 * side effect. `null` while the probe is in flight: a caller that hides a
 * control must not show it before the answer arrives.
 */
export function useDesktopAvailable(): boolean | null {
  const run = useNativeCommand()
  const [available, setAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    void run('window.state', {}).then((outcome) => {
      if (alive) setAvailable(outcome.ok)
    })
    return () => {
      alive = false
    }
  }, [run])

  return available
}

/**
 * Set the system window title when there is a shell.
 *
 * Browsers own their title; `unsupported` is the normal answer there and is
 * skipped without a notice.
 */
export function useWindowTitle(title: string): void {
  const run = useNativeCommand()
  useEffect(() => {
    void run('window.setTitle', { title })
  }, [run, title])
}
