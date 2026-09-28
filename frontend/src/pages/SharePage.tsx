import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageFrame } from '../features/library/PageFrame';
import { useNotices } from '../features/library/useNotices';
import { useShareContext } from '../features/share/ShareProvider';
import { ScrollViewport } from '../shared/ScrollViewport';
import type { AppError } from '../shared/api';

/** A failure this page caused, which has no reference to look up: what went
 * wrong is on screen and the remedy is to try again. */
function clientError(code: string): AppError {
  return { code, params: {}, errorId: 'interface' };
}

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

export function SharePage() {
  const { t, i18n } = useTranslation();
  const share = useShareContext();
  const notices = useNotices();
  // Hidden until asked for, which is what makes it safe to photograph the screen
  // or leave the page open in a room. Nothing is gained by it being hidden from
  // the person who started the service and is looking at it, so one press shows
  // it and the press is not remembered beyond the visit.
  const [shown, setShown] = useState(false);
  const running = share.port !== null;
  // The list of devices arrives with a timestamp, and how long ago that was is
  // the thing a person reads. It is worked out here against a clock that ticks
  // rather than against the one the list was fetched with, so that the ages
  // count up between the polls instead of standing still for five seconds and
  // then jumping.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const copyPassword = async () => {
    if (!navigator.clipboard) {
      notices.setError(clientError('app.clipboard.failed'));
      return;
    }
    try {
      await navigator.clipboard.writeText(share.password);
      notices.showCopyHint();
    } catch {
      notices.setError(clientError('app.clipboard.failed'));
    }
  };
  return (
    <PageFrame>
      <ScrollViewport className="min-h-0 space-y-4">
        <h1 className="text-3xl font-bold">{t('sharing')}</h1>
        <p>{running ? t('sharingOn') : t('sharingOff')}</p>
        {/* One button rather than two, as the favorite is one menu entry: the
            service is either running or it is not, and the label says which
            way this one moves it. Starting is the application's own primary
            action; ending is a close, and carries the neutral colour closes
            carry — nothing is being undone or thrown away by stopping. */}
        <button
          className={
            running
              ? 'btn btn-soft btn-md btn-neutral'
              : 'btn btn-soft btn-md btn-primary'
          }
          disabled={share.busy}
          onClick={() => void (running ? share.stop() : share.start())}
        >
          {running ? t('stopSharing') : t('startSharing')}
        </button>
        {/* Shown whether or not the service is running, and that is the point of
            it: the password is drawn the first time the interface asks for it,
            so a user can write it down, or type it into a television, before
            anything is answering. */}
        <div className="space-y-3">
          <p className="text-sm opacity-70">{t('credentialsHelp')}</p>
          <div className="flex items-center gap-3">
            <span className="w-24 text-sm opacity-70">{t('username')}</span>
            <code className="select-all">{share.username}</code>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-24 text-sm opacity-70">{t('password')}</span>
            {/* Dots of a fixed length rather than one per character: how long
                the password is is not a secret — it is this length every time —
                and a mask that changed width as the password changed would say
                more about it than the mask is for. */}
            <code className="select-all">
              {shown ? share.password : '••••••••••••'}
            </code>
            <button
              className="btn btn-ghost btn-sm"
              aria-pressed={shown}
              onClick={() => setShown(!shown)}
            >
              {shown ? t('hidePassword') : t('showPassword')}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void copyPassword()}
            >
              {t('copyPassword')}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="btn btn-soft btn-sm btn-neutral"
              disabled={share.busy}
              onClick={() => void share.regeneratePassword()}
            >
              {t('regeneratePassword')}
            </button>
            {/* Said only while it is true, which is the one moment a user would
                otherwise be looking at a password that does not work. */}
            {share.needsRestart && (
              <span className="text-sm text-warning">
                {t('passwordRestartNeeded')}
              </span>
            )}
          </div>
        </div>
        {/* Only while the service is running: nobody is a client of a service
            that is not there, and an empty list under a stopped service would
            read as a complaint about something that has not been asked for. */}
        {running && (
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{t('devicesTitle')}</h2>
            {/* The wording is load-bearing, and that is why it is a paragraph
                rather than a tooltip: a WebDAV client connects, takes the file
                it wants and disconnects, so a device that has gone back to the
                television menu looks exactly like one that never arrived —
                until a minute has passed. Someone who expects the row to
                disappear with the film will report the page as broken. */}
            <p className="text-sm opacity-70">{t('devicesHelp')}</p>
            {share.devices.length === 0 ? (
              <p className="text-sm opacity-70">{t('devicesEmpty')}</p>
            ) : (
              <ul className="space-y-1">
                {share.devices.map((device) => {
                  const seconds = secondsAgo(device.lastSeen, now);
                  return (
                    <li
                      key={device.address}
                      className="flex items-center gap-3"
                    >
                      {/* A client that did not say who it is still gets a row:
                          the address and the moment are what the row is made
                          of, and a blank name would read as a device that
                          failed to arrive. */}
                      <span className="truncate">
                        {device.name ?? t('unknown')}
                      </span>
                      <code>{device.address}</code>
                      <span className="text-sm opacity-70">
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
        )}
      </ScrollViewport>
    </PageFrame>
  );
}
