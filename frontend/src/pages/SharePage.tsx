import { useState } from 'react';
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

export function SharePage() {
  const { t } = useTranslation();
  const share = useShareContext();
  const notices = useNotices();
  // Hidden until asked for, which is what makes it safe to photograph the screen
  // or leave the page open in a room. Nothing is gained by it being hidden from
  // the person who started the service and is looking at it, so one press shows
  // it and the press is not remembered beyond the visit.
  const [shown, setShown] = useState(false);
  const running = share.port !== null;
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
      </ScrollViewport>
    </PageFrame>
  );
}
