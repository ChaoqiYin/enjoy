import { useTranslation } from 'react-i18next';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useState } from 'react';
import type { ScanStatus } from '../../shared/api';

export function Thumbnail({
  path,
  name,
  videoPath,
  scan,
}: {
  path: string | null;
  name: string;
  videoPath?: string;
  scan?: ScanStatus;
}) {
  const { t } = useTranslation();
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const processing =
    videoPath === scan?.currentPath &&
    (scan?.phase === 'processing' || scan?.phase === 'paused');
  if (processing) {
    return (
      <div
        className="aspect-video bg-base-300 flex flex-col gap-2 items-center justify-center text-center p-2 text-sm"
        role="status"
        aria-label={t('mediaPreparingName', { name })}
      >
        {scan.phase === 'processing' && (
          <span
            className="loading loading-spinner loading-sm"
            aria-hidden="true"
          />
        )}
        <span>
          {t(
            scan.phase === 'paused' ? 'mediaPreparingPaused' : 'mediaPreparing',
          )}
        </span>
      </div>
    );
  }
  if (!path || failedPath === path) {
    return (
      <div
        className="aspect-video bg-base-300 flex items-center justify-center text-base-content/60"
        aria-label={t('noThumbnail', { name })}
      >
        {t('thumbnailPending')}
      </div>
    );
  }
  return (
    <figure className="aspect-video bg-base-300">
      <img
        className="w-full h-full object-cover"
        src={convertFileSrc(path)}
        alt={name}
        loading="lazy"
        onError={() => setFailedPath(path)}
      />
    </figure>
  );
}
