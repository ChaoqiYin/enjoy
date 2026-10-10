import { useTranslation } from 'react-i18next';
import type { Video } from '../../shared/api';
import { Tooltip } from '../../shared/Tooltip';
import { displayPath, duration, fileSize } from '../../shared/format';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../shared/ui/table';
import { VideoActions } from './VideoActions';
import type { VideoActionHandlers } from './VideoActions';
import { VideoBadges } from './VideoBadges';
import type { MenuTarget } from './VideoMenu';

/**
 * The library as a table: one record per line, one fact per column, and the
 * columns named once at the top.
 *
 * It is the view for reading a fact across many records — which of these are
 * 1080p, which are the ones taking 4 GB — so it shows the whole path and no
 * picture at all: a thumbnail column would be the widest one in the table and
 * would make the rows tall enough that the columns stop lining up in the eye.
 * Whoever wants the picture has the grid and the compact list.
 *
 * There is no 「格式」 column, although the details panel names one: the panel
 * reads the container off the file name's extension, and a column of eight
 * values that are all the same word is a column that pushes the facts worth
 * comparing off the right edge (ADR 0017). What the records do carry is
 * `codec`, and that is what `编码` shows.
 *
 * The whole row is the click target for the details panel, as in the other two
 * views, and the controls in the last cell are the exception that claim their
 * own presses.
 */
export function VideoTable({
  videos,
  busy,
  actions,
  lastPlayedId,
  onMenu,
}: {
  videos: Video[];
  busy: boolean;
  actions: VideoActionHandlers;
  lastPlayedId: number | null;
  onMenu?: (target: MenuTarget) => void;
}) {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('filename')}</TableHead>
          <TableHead>{t('duration')}</TableHead>
          <TableHead>{t('resolution')}</TableHead>
          <TableHead>{t('codec')}</TableHead>
          <TableHead>{t('fileSize')}</TableHead>
          <TableHead>{t('modifiedAt')}</TableHead>
          <TableHead>{t('path')}</TableHead>
          <TableHead className="text-end">{t('actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {videos.map((video) => (
          <TableRow
            key={video.id}
            tabIndex={0}
            onContextMenu={(event) => {
              event.preventDefault();
              onMenu?.({ video, x: event.clientX, y: event.clientY });
            }}
            onKeyDown={(event) => {
              if (
                event.target instanceof HTMLElement &&
                event.target.closest('button')
              ) {
                return;
              }
              if (
                event.key === 'ContextMenu' ||
                (event.shiftKey && event.key === 'F10')
              ) {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                onMenu?.({ video, x: rect.left, y: rect.top });
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                actions.details(video);
              }
            }}
            className="cursor-pointer"
            onClick={() => actions.details(video)}
          >
            <TableCell className="max-w-0 min-w-[14rem]">
              {/* The name is the row's own heading, so it is what a table reader
                  hears first; the marks follow it in the same cell because they
                  are facts about the record and not a column of their own. */}
              <div className="flex items-center gap-2">
                <Tooltip text={video.file_name} className="block min-w-0">
                  <button
                    className="block w-full cursor-pointer truncate text-left font-medium"
                    onClick={(event) => {
                      event.stopPropagation();
                      actions.details(video);
                    }}
                  >
                    {video.file_name}
                  </button>
                </Tooltip>
                <VideoBadges
                  video={video}
                  variant="inline"
                  lastPlayed={video.id === lastPlayedId}
                />
              </div>
            </TableCell>
            <TableCell className="tabular-nums whitespace-nowrap">
              {duration(video.duration_ms)}
            </TableCell>
            <TableCell className="tabular-nums whitespace-nowrap">
              {video.width && video.height
                ? `${video.width} × ${video.height}`
                : t('unknown')}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {video.codec ?? t('unknown')}
            </TableCell>
            <TableCell className="tabular-nums whitespace-nowrap">
              {fileSize(video.file_size, i18n.language)}
            </TableCell>
            <TableCell className="tabular-nums whitespace-nowrap">
              {date.format(video.modified_at)}
            </TableCell>
            {/* The full path rather than the folder: the path is the fact and
                the folder is its beginning, and a path is what a user copies
                out of here. It is the one column allowed to be long, so it is
                the one that is told where to stop. */}
            <TableCell
              className="max-w-[24rem] truncate"
              title={displayPath(video.path)}
            >
              <span className="tabular-nums">{displayPath(video.path)}</span>
            </TableCell>
            <TableCell className="text-end">
              {/* No play here: the overlay on the picture carries it in the two
                  views that draw one, and this one has no picture, so the play
                  is the table's own control like any other. */}
              <div className="flex justify-end">
                <VideoActions
                  video={video}
                  busy={busy}
                  actions={actions}
                  iconOnly
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
