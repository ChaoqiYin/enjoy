import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Device } from '../../shared/api';

/**
 * How long ago a device was last heard from, in whole seconds.
 *
 * Never less than one. The moment comes from the backend and the clock it is
 * measured against is this one's, which are two clocks however well they agree;
 * a row that said "0 秒前" because they disagreed by a hair would read as one
 * that had stopped counting.
 */
function secondsAgo(lastSeen: number, now: number): number {
  return Math.max(1, Math.round((now - lastSeen) / 1000));
}

/**
 * The clients heard from in the last minute: who they said they were, where they
 * came from, and how long ago that was.
 *
 * Rendered only while a service is running — the page's call, because nobody is
 * a client of a service that is not there — and it keeps its own clock from
 * there: the list arrives with a timestamp, and how long ago that was is the
 * thing a person reads, so the ages are worked out against a clock that ticks
 * rather than against the one the list was fetched with. That is what makes them
 * count up between the polls instead of standing still for five seconds and then
 * jumping, and it is a rule of this block's own, tested here rather than through
 * a page that has to be running to show it.
 */
export function DeviceList({ devices }: { devices: Device[] }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">{t('devicesTitle')}</h2>
      {/* The wording is load-bearing, and that is why it is a paragraph
          rather than a tooltip: a WebDAV client connects, takes the file
          it wants and disconnects, so a device that has gone back to the
          television menu looks exactly like one that never arrived —
          until a minute has passed. Someone who expects the row to
          disappear with the film will report the page as broken. */}
      <p className="text-sm text-muted-foreground">{t('devicesHelp')}</p>
      {devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('devicesEmpty')}</p>
      ) : (
        <ul className="space-y-1">
          {devices.map((device) => {
            const seconds = secondsAgo(device.lastSeen, now);
            return (
              <li key={device.address} className="flex items-center gap-3">
                {/* A client that did not say who it is still gets a row:
                    the address and the moment are what the row is made
                    of, and a blank name would read as a device that
                    failed to arrive. */}
                <span className="truncate">{device.name ?? t('unknown')}</span>
                <code>{device.address}</code>
                <span className="text-sm text-muted-foreground">
                  {t('activeAgo', {
                    count: seconds,
                    countText: seconds.toLocaleString(i18n.language),
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
