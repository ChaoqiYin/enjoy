import { useTranslation } from 'react-i18next';
import type { ScanStatus, Video } from '../../shared/api';
import { Tooltip } from '../../shared/Tooltip';
import { duration, fileSize } from '../../shared/format';
import { HoverPlayOverlay } from './HoverPlayOverlay';
import { Thumbnail } from './Thumbnail';
import { VideoActions } from './VideoActions';
import type { VideoActionHandlers } from './VideoActions';
import { VideoBadges } from './VideoBadges';
import type { MenuTarget } from './VideoMenu';

/**
 * One video as the compact list draws it: a sliver of the picture, the name and
 * two lines of facts beside it, and the controls at the far end.
 *
 * It is a row and not a second card — the picture is small enough to be read as
 * a colour rather than looked at, and what it buys with the space it gives up is
 * the facts a card has none of: the resolution and the size, on a second line
 * under the name. The list is the view for comparing many records at once, so
 * each row is one line of a table of contents written without rules.
 *
 * The whole row is the click target for the details panel, exactly like the
 * card's block, and it answers Enter and Space the same way. The controls it
 * draws are the exception and claim their own presses.
 *
 * The marks are worn inline here rather than floated over the picture: the
 * picture is a 96-pixel thumbnail whose corner a sentence would cover whole,
 * and a row is read left to right anyway, so the marks take their place in the
 * line they belong to (`VideoBadges`, `inline`).
 */
export function VideoRow({
  video,
  busy,
  actions,
  lastPlayedId,
  scan,
  onMenu,
}: {
  video: Video;
  busy: boolean;
  actions: VideoActionHandlers;
  lastPlayedId: number | null;
  scan?: ScanStatus;
  onMenu?: (target: MenuTarget) => void;
}) {
  const { t, i18n } = useTranslation();
  const resolution =
    video.width && video.height
      ? `${video.width} × ${video.height}`
      : t('unknown');
  return (
    <li
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
      className="group flex list-none cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-2 text-card-foreground transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      onClick={() => actions.details(video)}
    >
      {/* The picture keeps the card's ratio at a fixed 96 pixels, so every row
          is the same height and the column of pictures reads as a stripe. */}
      <div className="relative w-24 shrink-0">
        <Thumbnail
          videoPath={video.path}
          scan={scan}
          path={video.thumbnail_path}
          name={video.file_name}
        />
        <HoverPlayOverlay disabled={busy} onPlay={() => actions.play(video)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Tooltip text={video.file_name} className="block min-w-0">
          <button
            className="block w-full cursor-pointer truncate text-left text-sm font-semibold leading-snug"
            onClick={(event) => {
              event.stopPropagation();
              actions.details(video);
            }}
          >
            {video.file_name}
          </button>
        </Tooltip>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
          <span>{duration(video.duration_ms)}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{resolution}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">
            {fileSize(video.file_size, i18n.language)}
          </span>
          <VideoBadges
            video={video}
            variant="inline"
            lastPlayed={video.id === lastPlayedId}
          />
        </div>
      </div>
      {/* No play here: the picture's overlay carries it, so the row has one
          control named Play rather than two that do the same thing. */}
      <VideoActions
        video={video}
        busy={busy}
        actions={actions}
        iconOnly
        hidePlay
      />
    </li>
  );
}
