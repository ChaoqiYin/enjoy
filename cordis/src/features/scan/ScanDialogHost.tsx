/**
 * The one scan dialog, mounted once for the whole body.
 *
 * Pages never own the dialog: a scan is a slot on the backend, so any page that
 * starts one gets the same window. Mounting it here also means a scan that was
 * already running when the body loaded is picked up from `GET
 * /api/scan/status`, and a browser WebSocket that dropped re-reads that status
 * before trusting the next progress frame.
 */

import { useCallback, useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { ScanStatus } from '../../shared/api'
import { useNotify } from '../../shared/notify'
import { useServices } from '../../shared/services'
import type { ScanEvent } from '../../shared/scanEvents'
import { ScanDialog } from './ScanDialog'
import { isTerminalPhase } from './phases'

export function ScanDialogHost() {
  const { api, scanEvents } = useServices()
  const notify = useNotify()
  const { t, i18n } = useTranslation()
  const [spaceId, setSpaceId] = useState<number | null>(null)
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [cancelling, setCancelling] = useState(false)

  /** Re-read the slot; used after a reconnect and after the initial mount. */
  const refresh = useCallback(async () => {
    try {
      const next = await api.scanStatus()
      setStatus(next.active ? next : null)
      if (!next.active) setCancelling(false)
    } catch {
      // The status route is best effort: a dropped read is not worth a notice,
      // and the next progress frame still drives the dialog.
    }
  }, [api])

  useEffect(() => {
    let alive = true
    void Promise.all([api.listSpaces(), api.scanStatus()])
      .then(([spaces, next]) => {
        if (!alive) return
        const current = spaces.find((space) => space.current) ?? spaces[0]
        setSpaceId(current?.id ?? null)
        if (next.active) setStatus(next)
      })
      .catch(() => {
        // Without a space there is nothing to filter by; the dialog stays shut.
      })
    return () => {
      alive = false
    }
  }, [api])

  useEffect(() => {
    return scanEvents.subscribe(
      (event) => {
        if (spaceId === null || event.spaceId !== spaceId) return
        if (isTerminalPhase(event.phase)) {
          setStatus(null)
          setCancelling(false)
          if (event.phase === 'done') {
            void notify({
              title: t('scanComplete'),
              body: completionBody(event, t, i18n.language),
            })
          }
          return
        }
        setStatus({ active: true, ...event })
      },
      {
        onConnect: (reconnected) => {
          if (reconnected) void refresh()
        },
      },
    )
  }, [scanEvents, spaceId, notify, refresh, t, i18n.language])

  const control = useCallback(
    async (action: 'pause' | 'resume' | 'cancel') => {
      const scanId = status?.scanId
      if (scanId === undefined) return
      try {
        const phase = await api.controlScan(scanId, action)
        if (action === 'cancel') {
          // The worker still has to reach its checkpoint; the dialog stays put
          // until the terminal frame says the slot is free.
          setCancelling(true)
          return
        }
        setStatus((current) =>
          current === null ? current : { ...current, phase },
        )
      } catch {
        // A refused control leaves the dialog as it was; the next status or
        // frame is the authority.
      }
    },
    [api, status?.scanId],
  )

  if (status === null) return null

  return (
    <ScanDialog
      status={status}
      cancelling={cancelling}
      onPause={() => void control('pause')}
      onResume={() => void control('resume')}
      onCancel={() => void control('cancel')}
    />
  )
}

function completionBody(
  event: ScanEvent,
  t: TFunction,
  language: string,
): string {
  const format = new Intl.NumberFormat(language)
  return t('scanChanges', {
    added: format.format(event.changes?.added ?? 0),
    updated: format.format(event.changes?.updated ?? 0),
    removed: format.format(event.changes?.removed ?? 0),
  })
}
