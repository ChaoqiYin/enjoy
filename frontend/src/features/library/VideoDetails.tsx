import {
  CalendarDays,
  Clock,
  Copy,
  Cpu,
  FolderOpen,
  HardDrive,
  Monitor,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ScanStatus, Video } from '../../shared/api';
import { displayPath, duration, fileSize } from '../../shared/format';
import { Button } from '../../shared/ui/button';
import { MaintenanceButton } from './MaintenanceButton';
import { Thumbnail } from './Thumbnail';
import { VideoActions } from './VideoActions';
import type { VideoActionHandlers } from './VideoActions';
import { VideoMetaTable } from './VideoMetaTable';
import type { VideoMetaRow } from './VideoMetaTable';

/**
 * The class a picture's height puts it in, named the way the trade names it, or
 * nothing when the height is not known. It is read off the numbers beside it
 * rather than stored: the record carries the pixels and not a marketing name,
 * and the badge is only ever the short form of what is already on the line.
 */
function resolutionClass(height: number | null): string | undefined {
  if (!height) return undefined;
  if (height >= 4320) return '8K';
  if (height >= 2160) return '4K';
  if (height >= 1440) return 'QHD';
  if (height >= 1080) return 'FHD';
  if (height >= 720) return 'HD';
  return 'SD';
}

/** The panel's contents. The drawer shell around it — and the `title` and
 *  `closeLabel` it shows — belongs to the caller that owns the open state.
 *
 *  What the panel adds to the record is the way to act on it: the path the copy
 *  writes is the one spelled out here, and the two maintenance actions are the
 *  ones that ask the backend to look at this file again. Copying reports
 *  through the action the caller hands in, because the two answers are told in
 *  two places — the short hint for a copy that landed, the notice for one that
 *  did not — and that split belongs to whoever is drawing those, not here.
 */
export function VideoDetails({
  video,
  scan,
  busy,
  actions,
}: {
  video: Video;
  scan?: ScanStatus;
  busy: boolean;
  actions: VideoActionHandlers;
}) {
  const { t, i18n } = useTranslation();
  const rows: VideoMetaRow[] = [
    {
      icon: <Clock size={15} aria-hidden="true" />,
      label: t('duration'),
      value: duration(video.duration_ms),
    },
    {
      icon: <Monitor size={15} aria-hidden="true" />,
      label: t('resolution'),
      value: video.width ? `${video.width} × ${video.height}` : t('unknown'),
      badge: video.width ? resolutionClass(video.height) : undefined,
    },
    {
      icon: <Cpu size={15} aria-hidden="true" />,
      label: t('codec'),
      value: video.codec ?? t('unknown'),
    },
    {
      icon: <HardDrive size={15} aria-hidden="true" />,
      label: t('fileSize'),
      value: fileSize(video.file_size, i18n.language),
    },
    {
      icon: <CalendarDays size={15} aria-hidden="true" />,
      label: t('modifiedAt'),
      value: new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(video.modified_at),
    },
  ];
  return (
    <>
      <Thumbnail
        path={video.thumbnail_path}
        name={video.file_name}
        videoPath={video.path}
        scan={scan}
      />
      <h3 className="text-lg font-semibold break-all">{video.file_name}</h3>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <FolderOpen size={15} className="shrink-0" aria-hidden="true" />
          <span className="truncate font-mono">{displayPath(video.path)}</span>
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void actions.copyPath(video)}
        >
          <Copy size={14} aria-hidden="true" />
          {t('copyPath')}
        </Button>
      </div>
      <VideoActions
        video={video}
        busy={busy}
        actions={actions}
        iconOnly
        hideRemove
      />
      <VideoMetaTable rows={rows} />
      <section className="space-y-3">
        <h3 className="font-semibold">{t('fileMaintenance')}</h3>
        <div className="flex flex-wrap gap-3">
          <MaintenanceButton
            video={video}
            action={actions.regenerate}
            variant="secondary"
            icon={<RefreshCw size={14} aria-hidden="true" />}
            label={t('regenerate')}
            disabled={busy}
          />
          <MaintenanceButton
            video={video}
            action={actions.refreshInfo}
            variant="secondary"
            icon={<RefreshCw size={14} aria-hidden="true" />}
            label={t('refreshInfo')}
            disabled={busy}
          />
        </div>
        {busy && <p className="text-sm text-muted-foreground">{t('busy')}</p>}
      </section>
    </>
  );
}
