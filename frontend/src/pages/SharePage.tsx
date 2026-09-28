import { useTranslation } from 'react-i18next';
import { PageFrame } from '../features/library/PageFrame';
import { useShareContext } from '../features/share/ShareProvider';
import { ScrollViewport } from '../shared/ScrollViewport';

export function SharePage() {
  const { t } = useTranslation();
  const share = useShareContext();
  const running = share.port !== null;
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
      </ScrollViewport>
    </PageFrame>
  );
}
