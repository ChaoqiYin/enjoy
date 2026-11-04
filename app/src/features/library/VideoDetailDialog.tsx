/**
 * The record behind a card.
 *
 * The card only has room for a name and a size, so the rest of the record is
 * read on demand from `GET /api/videos/:id`. Actions stay the same ones the
 * listing offers, plus the close control that returns the reader to the grid.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share2 } from 'lucide-react'
import {
  normalizeError,
  type ApiError,
  type Video,
} from '../../shared/api'
import { errorTranslationKey } from '../../shared/errorText'
import { displayPath, duration, fileSize } from '../../shared/format'
import { useServices } from '../../shared/services'
import { Alert, AlertDescription } from '../../shared/ui/alert'
import { Button } from '../../shared/ui/button'

export function VideoDetailDialog({
  videoId,
  canReveal,
  onPlay,
  onToggleFavorite,
  onToggleShared,
  onReveal,
  onClose,
}: {
  videoId: number
  canReveal: boolean
  onPlay: (video: Video) => Promise<void>
  onToggleFavorite: (video: Video) => Promise<void>
  onToggleShared: (video: Video) => Promise<void>
  onReveal: (video: Video) => Promise<void>
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { api } = useServices()
  const [video, setVideo] = useState<Video | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [sharedBusy, setSharedBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setVideo(null)
    setError(null)
    api
      .getVideo(videoId)
      .then((record) => {
        if (alive) setVideo(record)
      })
      .catch((reason: unknown) => {
        if (alive) setError(normalizeError(reason))
      })
    return () => {
      alive = false
    }
  }, [api, videoId])

  const toggleFavorite = async (): Promise<void> => {
    if (video === null || favoriteBusy) return
    setFavoriteBusy(true)
    try {
      await onToggleFavorite(video)
      // The listing owns the write; rereading keeps this dialog in step with
      // whatever the server actually stored.
      setVideo(await api.getVideo(video.id))
    } catch (reason) {
      setError(normalizeError(reason))
    } finally {
      setFavoriteBusy(false)
    }
  }

  const toggleShared = async (): Promise<void> => {
    if (video === null || sharedBusy) return
    setSharedBusy(true)
    try {
      await onToggleShared(video)
      setVideo(await api.getVideo(video.id))
    } catch (reason) {
      setError(normalizeError(reason))
    } finally {
      setSharedBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <dialog
        open
        aria-modal="true"
        aria-labelledby="video-detail-title"
        data-testid="video-detail-dialog"
        onCancel={(event) => {
          event.preventDefault()
          onClose()
        }}
        className="m-0 w-full max-w-xl rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
      >
        <h2 id="video-detail-title" className="text-lg font-semibold">
          {t('videoDetails')}
        </h2>

        {error !== null ? (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{t(errorTranslationKey(error))}</AlertDescription>
          </Alert>
        ) : video === null ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('loading')}</p>
        ) : (
          <>
            <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
              <Field
                testid="detail-name"
                label={t('name')}
                value={video.fileName}
              />
              <Field
                testid="detail-path"
                label={t('filePath')}
                value={displayPath(video.path)}
                wrap
              />
              <Field
                testid="detail-size"
                label={t('fileSize')}
                value={fileSize(video.fileSize, i18n.language)}
              />
              <Field
                testid="detail-duration"
                label={t('duration')}
                value={duration(video.durationMs)}
              />
              <Field
                testid="detail-resolution"
                label={t('resolution')}
                value={
                  video.width === null || video.height === null
                    ? '—'
                    : `${video.width} × ${video.height}`
                }
              />
              <Field
                testid="detail-codec"
                label={t('codec')}
                value={video.codec ?? '—'}
              />
              <Field
                testid="detail-favorite"
                label={t('favorite')}
                value={t(video.favorite ? 'favorited' : 'notFavorited')}
              />
            </dl>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button
                data-testid="detail-play"
                size="lg"
                onClick={() => void onPlay(video)}
              >
                {t('play')}
              </Button>
              {canReveal && (
                <Button
                  data-testid="detail-reveal"
                  variant="outline"
                  size="lg"
                  onClick={() => void onReveal(video)}
                >
                  {t('showInFolder')}
                </Button>
              )}
              <Button
                data-testid="detail-favorite-toggle"
                variant="outline"
                size="lg"
                aria-pressed={video.favorite}
                disabled={favoriteBusy}
                onClick={() => void toggleFavorite()}
              >
                {t(video.favorite ? 'unfavorite' : 'favorite')}
              </Button>
              <Button
                data-testid="detail-share-toggle"
                variant="outline"
                size="lg"
                aria-pressed={video.shared}
                disabled={sharedBusy}
                onClick={() => void toggleShared()}
              >
                <Share2 className="size-4" aria-hidden="true" />
                {t(video.shared ? 'unshare' : 'share')}
              </Button>
              <Button
                data-testid="detail-close"
                variant="secondary"
                size="lg"
                onClick={onClose}
              >
                {t('close')}
              </Button>
            </div>
          </>
        )}
      </dialog>
    </div>
  )
}

function Field({
  testid,
  label,
  value,
  wrap = false,
}: {
  testid: string
  label: string
  value: string
  wrap?: boolean
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        data-testid={testid}
        className={wrap ? 'break-all' : undefined}
      >
        {value}
      </dd>
    </>
  )
}
