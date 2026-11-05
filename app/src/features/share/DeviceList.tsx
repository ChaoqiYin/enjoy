import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ShareDevice } from '../../shared/api'

/** Whole seconds since the last request; never zero, so the row never looks
 *  stopped because two clocks disagree by a hair. */
function secondsAgo(lastSeenAt: number, now: number): number {
  return Math.max(1, Math.round((now - lastSeenAt) / 1000))
}

/**
 * The clients heard from in the last minute, and how long ago each was.
 *
 * The ages are counted against a clock of this block's own rather than against
 * the moment the list was fetched: otherwise every row would stand still for
 * five seconds and then jump with the poll.
 *
 * A row is two lines — the name the client gave, and the address it came from —
 * with the age held to the right, so a narrow column still reads as a table.
 */
export function DeviceList({ devices }: { devices: ShareDevice[] }) {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t('devicesHelp')}</p>
      {devices.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('devicesEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {devices.map((device) => {
            const seconds = secondsAgo(device.lastSeenAt, now)
            return (
              <li
                key={device.address}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate">
                    {device.name === '' ? t('unknown') : device.name}
                  </span>
                  <code className="block truncate text-xs text-muted-foreground">
                    {device.address}
                  </code>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {t(seconds === 1 ? 'activeAgo_one' : 'activeAgo_other', {
                    countText: seconds.toLocaleString(i18n.language),
                  })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
