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
 */
export function DeviceList({ devices }: { devices: ShareDevice[] }) {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">{t('devicesTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('devicesHelp')}</p>
      {devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('devicesEmpty')}</p>
      ) : (
        <ul className="space-y-1">
          {devices.map((device) => {
            const seconds = secondsAgo(device.lastSeenAt, now)
            return (
              <li
                key={device.address}
                className="flex items-center gap-3"
              >
                <span className="truncate">
                  {device.name === '' ? t('unknown') : device.name}
                </span>
                <code>{device.address}</code>
                <span className="text-sm text-muted-foreground">
                  {t(seconds === 1 ? 'activeAgo_one' : 'activeAgo_other', {
                    countText: seconds.toLocaleString(i18n.language),
                  })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
