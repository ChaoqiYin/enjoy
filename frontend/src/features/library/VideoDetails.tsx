import {
  CalendarDays,
  Clock,
  Copy,
  Cpu,
  FolderOpen,
  HardDrive,
  Monitor,
  Puzzle,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ScanStatus, Video, VideoField } from '../../shared/api';
import { displayPath, duration, fileSize } from '../../shared/format';
import { Button } from '../../shared/ui/button';
import { usePluginPanels } from '../../plugins/PluginHostProvider';
import type { SpaceRef } from '../../plugins/mountPoints';
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
 *
 *  `fields` are what the plugins wrote about this video, handed in rather than
 *  fetched here: which video is open, and when it was opened, is the drawer's
 *  business, and this panel is drawn the same way in a test as in the
 *  application. They are drawn under the record's own terms because they are
 *  not terms the record has, and each carries the plugin it came from — a value
 *  a plugin wrote is not the kernel's to present as its own.
 *
 *  `space` is handed in for the same reason and is the one thing here that is
 *  not about this video: a block a plugin draws is told which space the window
 *  is in (`VideoPanelParams`), and which space that is belongs to the drawer
 *  that opened the video rather than to the panel.
 */
export function VideoDetails({
  video,
  space,
  scan,
  busy,
  actions,
  fields = [],
}: {
  video: Video;
  space: SpaceRef;
  scan?: ScanStatus;
  busy: boolean;
  actions: VideoActionHandlers;
  fields?: VideoField[];
}) {
  const { t, i18n } = useTranslation();
  // The blocks the plugins registered at `video.panel`, in plugin order. This
  // is the render side of that mount point, and the position is this panel's
  // own decision: the file's own header stays together — picture, name, path
  // and the actions on it — the plugins' own area comes next, and the record's
  // terms follow. A library with no plugins reads exactly as it always did,
  // because the position is empty and draws nothing (User Story 13).
  const panels = usePluginPanels();
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
    // The plugin fields, in the order the backend handed them over — which is
    // the order of their keys, so a panel read twice reads the same way. The
    // label is the field key's own word in the window's language (`field.<key>`
    // in the translations), falling back to the key for a row filed before the
    // set of keys was closed; the puzzle piece is the same one the navigation
    // marks the plugin page with — what this line is, is not this
    // application's own.
    ...fields.map((field) => ({
      icon: <Puzzle size={15} aria-hidden="true" />,
      label: t('field.' + field.key, field.key),
      value: field.value,
      source: field.source_plugin,
    })),
  ];
  return (
    <>
      <Thumbnail video={video} scan={scan} />
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
      {/* One block per plugin, each handed the space and the video it is
          about. Nothing is drawn around them: what a block looks like is the
          plugin's own business, and the panel only gives it the room. */}
      {panels.map(({ owner, contribution }) => {
        const Drawn = contribution.draw;
        return (
          <Drawn
            key={`${owner}:${contribution.key}`}
            space={space}
            video={{ id: video.id, path: video.path }}
          />
        );
      })}
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
