/**
 * The notification capability, with its browser fallback in one place.
 *
 * A system notification is the desktop answer; a browser has none, and the
 * spec's rule is that `unsupported` becomes a page Toast rather than an error.
 * Keeping that decision here means the scan dialog does not have to know which
 * build it is running in.
 */

import { useCallback } from 'react'
import { useNativeCommand } from './native'
import { useToast } from './toast'

export interface Notice {
  title: string
  body?: string
}

export function useNotify(): (notice: Notice) => Promise<void> {
  const run = useNativeCommand()
  const toast = useToast()

  return useCallback(
    async (notice) => {
      const outcome = await run('notification.show', {
        title: notice.title,
        body: notice.body ?? '',
      })
      if (!outcome.ok && outcome.unsupported) {
        toast.show({ ...notice, variant: 'success' })
      }
    },
    [run, toast],
  )
}
