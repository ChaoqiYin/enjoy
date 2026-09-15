import type { ScanStatus, Video } from '../../shared/api';
import { Tooltip } from '../../shared/Tooltip';
import { duration } from '../../shared/format';
import { Thumbnail } from './Thumbnail';
import { VideoActions } from './VideoActions';
import type { VideoActionHandlers } from './VideoActions';
import type { MenuTarget } from './VideoMenu';

export function VideoCard({
  video,
  selectedId,
  onSelect,
  onMenu,
  busy,
  actions,
  scan,
}: {
  video: Video;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onMenu: (target: MenuTarget) => void;
  busy: boolean;
  actions: VideoActionHandlers;
  scan?: ScanStatus;
}) {
  return (
    <article
      key={video.id}
      tabIndex={0}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ video, x: event.clientX, y: event.clientY });
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
          onMenu({ video, x: rect.left, y: rect.top });
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          actions.details(video);
        }
      }}
      className={`card card-border bg-base-200 ${selectedId === video.id ? 'outline outline-2' : ''}`}
      onClick={() => actions.details(video)}
    >
      <Thumbnail
        videoPath={video.path}
        scan={scan}
        path={video.thumbnail_path}
        name={video.file_name}
      />
      <div className="card-body p-3 gap-1.5">
        <h2 className="card-title min-w-0 text-sm font-semibold leading-snug">
          <Tooltip text={video.file_name} className="block min-w-0 w-full">
            <button
              className="block min-w-0 w-full truncate text-left"
              onClick={(event) => {
                event.stopPropagation();
                actions.details(video);
              }}
            >
              {video.file_name}
            </button>
          </Tooltip>
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-xs tabular-nums text-base-content/55">
            {duration(video.duration_ms)}
          </span>
          <VideoActions video={video} busy={busy} actions={actions} iconOnly />
        </div>
      </div>
    </article>
  );
}
