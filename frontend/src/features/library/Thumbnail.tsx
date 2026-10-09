import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { thumbnailUrl } from '../../shared/api';
import type { ScanStatus } from '../../shared/api';
import { Spinner } from '../../shared/ui/spinner';
import { pictureClass } from './videoCardBox';

/**
 * The picture area of a video, in all three places one is drawn: the card, the
 * compact row and the details panel.
 *
 * It holds its own ratio and does its own clipping (`aspect-video` plus
 * `overflow-hidden`), and it is told how wide to be by the caller rather than
 * insisting on a width of its own — which is what lets the row draw a 96-pixel
 * sliver of the same component the card draws full width, with no second
 * picture area to keep in step. The ratio comes from `videoCardBox`, which is
 * where the picture area's class is declared.
 *
 * Three states, in the order they are worth telling apart: the file being
 * prepared right now (which is the only one the user can act on), a picture
 * that is not here yet or will not load, and the picture.
 */
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
        className={`${pictureClass} flex flex-col items-center justify-center gap-2 overflow-hidden bg-muted p-2 text-center text-sm`}
        role="status"
        aria-label={t('mediaPreparingName', { name })}
      >
        {scan.phase === 'processing' && (
          // The element around it is the one that speaks, so this is drawn and
          // not announced: a second live region inside the first would say the
          // same thing twice.
          <Spinner size="sm" aria-hidden="true" />
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
        className={`${pictureClass} flex items-center justify-center overflow-hidden bg-muted text-muted-foreground`}
        aria-label={t('noThumbnail', { name })}
      >
        {t('thumbnailPending')}
      </div>
    );
  }
  return (
    <figure className={`${pictureClass} overflow-hidden bg-muted`}>
      <img
        className="h-full w-full object-cover"
        src={thumbnailUrl(path)}
        alt={name}
        loading="lazy"
        onError={() => setFailedPath(path)}
      />
    </figure>
  );
}
