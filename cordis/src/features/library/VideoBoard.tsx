import { Film, Heart, Play } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { thumbnailUrl, type Video } from '../../shared/api'
import { cn } from '../../shared/cn'
import { duration, fileSize } from '../../shared/format'
import { Button } from '../../shared/ui/button'

interface VideoActionProps {
  video: Video
  onPlay: (video: Video) => void
  onToggleFavorite: (video: Video) => void
}

function FavoriteButton({ video, onToggleFavorite }: VideoActionProps) {
  const { t } = useTranslation()
  return (
    <Button
      data-testid="favorite-video"
      variant="ghost"
      size="icon-sm"
      aria-pressed={video.favorite}
      aria-label={video.favorite ? t('unfavorite') : t('favorite')}
      title={video.favorite ? t('unfavorite') : t('favorite')}
      onClick={() => onToggleFavorite(video)}
      className={cn(video.favorite && 'text-primary')}
    >
      <Heart className={cn('size-4', video.favorite && 'fill-current')} />
    </Button>
  )
}

export function VideoCard({ video, onPlay, onToggleFavorite }: VideoActionProps) {
  const { t, i18n } = useTranslation()
  const [thumbnailFailed, setThumbnailFailed] = useState(false)
  return (
    <article
      data-testid="video-card"
      data-video-id={video.id}
      data-favorite={String(video.favorite)}
      className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground"
    >
      <button
        type="button"
        data-testid="play-video"
        aria-label={`${t('play')} ${video.fileName}`}
        onClick={() => onPlay(video)}
        className="relative flex aspect-video items-center justify-center bg-muted text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {thumbnailFailed ? (
          <Film className="size-8 opacity-60" />
        ) : (
          <img
            data-testid="video-thumbnail"
            src={thumbnailUrl(video.id)}
            alt=""
            loading="lazy"
            onError={() => setThumbnailFailed(true)}
            className="size-full object-cover"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Play className="size-4 fill-current" />
          </span>
        </span>
        {video.durationMs !== null && (
          <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1 text-[11px] text-white">
            {duration(video.durationMs)}
          </span>
        )}
      </button>

      <div className="flex min-w-0 items-start gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium" title={video.fileName}>
            {video.fileName}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {fileSize(video.fileSize, i18n.language)}
          </p>
        </div>
        <FavoriteButton
          video={video}
          onPlay={onPlay}
          onToggleFavorite={onToggleFavorite}
        />
      </div>
    </article>
  )
}

export function VideoRow({ video, onPlay, onToggleFavorite }: VideoActionProps) {
  const { t, i18n } = useTranslation()
  return (
    <div
      data-testid="video-row"
      data-video-id={video.id}
      data-favorite={String(video.favorite)}
      className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-card-foreground"
    >
      <button
        type="button"
        data-testid="play-video"
        aria-label={`${t('play')} ${video.fileName}`}
        onClick={() => onPlay(video)}
        className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Play className="size-4" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm">{video.fileName}</span>
      <span className="hidden text-xs text-muted-foreground sm:block">
        {fileSize(video.fileSize, i18n.language)}
      </span>
      <span className="hidden text-xs text-muted-foreground md:block">
        {duration(video.durationMs)}
      </span>
      <FavoriteButton
        video={video}
        onPlay={onPlay}
        onToggleFavorite={onToggleFavorite}
      />
    </div>
  )
}

export function VideoTable({ videos, onPlay, onToggleFavorite }: {
  videos: Video[]
  onPlay: (video: Video) => void
  onToggleFavorite: (video: Video) => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table data-testid="video-table" className="w-full text-left text-sm">
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t('name')}</th>
            <th className="px-3 py-2 font-medium">{t('fileSize')}</th>
            <th className="px-3 py-2 font-medium">{t('duration')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => (
            <tr
              key={video.id}
              data-testid="video-table-row"
              className="border-t border-border"
            >
              <td className="max-w-0 truncate px-3 py-2" title={video.fileName}>
                {video.fileName}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {fileSize(video.fileSize, i18n.language)}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {duration(video.durationMs)}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    data-testid="play-video"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t('play')} ${video.fileName}`}
                    onClick={() => onPlay(video)}
                  >
                    <Play className="size-4" />
                  </Button>
                  <FavoriteButton
                    video={video}
                    onPlay={onPlay}
                    onToggleFavorite={onToggleFavorite}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function VideoBoard({
  viewMode,
  videos,
  onPlay,
  onToggleFavorite,
}: {
  viewMode: 'grid' | 'list' | 'table'
  videos: Video[]
  onPlay: (video: Video) => void
  onToggleFavorite: (video: Video) => void
}) {
  return (
    <div data-testid="video-board" data-view-mode={viewMode}>
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onPlay={onPlay}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
      {viewMode === 'list' && (
        <div className="flex flex-col gap-2">
          {videos.map((video) => (
            <VideoRow
              key={video.id}
              video={video}
              onPlay={onPlay}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
      {viewMode === 'table' && (
        <VideoTable
          videos={videos}
          onPlay={onPlay}
          onToggleFavorite={onToggleFavorite}
        />
      )}
    </div>
  )
}
