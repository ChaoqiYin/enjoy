import { useTranslation } from 'react-i18next';
import type { MenuTarget } from './VideoMenu';
import type { ScanStatus, Video } from './api';
import { duration } from './format';
import { Thumbnail } from './Thumbnail';
import { VideoActions } from './VideoActions';
import type { VideoActionHandlers } from './VideoActions';

export function VideoList({
  videos,
  selectedId,
  onSelect,
  onMenu,
  busy,
  actions,
  scan,
}: {
  videos: Video[];
  scan?: ScanStatus;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onMenu: (target: MenuTarget) => void;
  busy: boolean;
  actions: VideoActionHandlers;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-box border border-base-300">
      <table className="table">
        <thead>
          <tr>
            {[
              'thumbnail',
              'filename',
              'folder',
              'duration',
              'resolution',
              'actions',
            ].map((key) => (
              <th key={key}>{t(key)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => (
            <tr
              key={video.id}
              tabIndex={0}
              onContextMenu={(event) => {
                event.preventDefault();
                onMenu({ video, x: event.clientX, y: event.clientY });
              }}
              onKeyDown={(event) => {
                if (
                  event.key === 'ContextMenu' ||
                  (event.shiftKey && event.key === 'F10')
                ) {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  onMenu({ video, x: rect.left, y: rect.top });
                }
              }}
              className={selectedId === video.id ? 'bg-base-200' : ''}
              onClick={() => onSelect(video.id)}
              onDoubleClick={() => {
                if (!busy && video.available) actions.play(video);
              }}
            >
              <td>
                <div className="w-24">
                  <Thumbnail
                    videoPath={video.path}
                    scan={scan}
                    path={video.thumbnail_path}
                    name={video.file_name}
                  />
                </div>
              </td>
              <td>
                <button
                  className="btn btn-ghost h-auto text-left whitespace-normal max-w-64 break-all"
                  onClick={() => actions.details(video)}
                >
                  {video.file_name}
                </button>
                {!video.available && (
                  <p className="text-warning">{t('unavailable')}</p>
                )}
              </td>
              <td>
                <span
                  className="block max-w-48 truncate"
                  title={video.folder_path}
                >
                  {video.folder_path}
                </span>
              </td>
              <td className="tabular-nums">{duration(video.duration_ms)}</td>
              <td>
                {video.width
                  ? `${video.width} × ${video.height}`
                  : t('unknown')}
              </td>
              <td>
                <VideoActions video={video} busy={busy} actions={actions} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
