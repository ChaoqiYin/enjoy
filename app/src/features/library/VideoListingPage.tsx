import { useState } from 'react'
import { FolderPlus, SearchX, VideoOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/ui/button'
import { ScrollViewport } from '../../shared/ScrollViewport'
import { useNativeCommand } from '../../shared/native'
import type { Video } from '../../shared/api'
import type { Listing } from './listing'
import { DirectoryActions } from './DirectoryActions'
import { EmptyState } from './EmptyState'
import { LibraryToolbar } from './LibraryToolbar'
import { ListingNotices } from './ListingNotices'
import { Pagination } from './Pagination'
import { VideoBoard } from './VideoBoard'
import { VideoDetailDialog } from './VideoDetailDialog'
import { hoverRoomStyle } from './videoCardBox'
import { useVideoListing } from './useVideoListing'
import { PageFrame } from '../layout/PageFrame'

/**
 * The screen both listing routes share. The route decides which records it
 * reads, and the file decides the arrangement the old interface gave every
 * listing: the toolbar at the top, the count above the scroll area, the page of
 * records in the middle and the pager under it.
 *
 * The count is about the library and is drawn above the scroll area rather than
 * in it; the records scroll between the count and the pager, and the pager is
 * the page's footer rather than the list's. What clips the cards is the scroll
 * viewport, and the room the first row's and first column's glow needs is the
 * clipper's to give (`hoverRoomStyle`), exactly as before.
 */
export function VideoListingPage({ listing }: { listing: Listing }) {
  const { t, i18n } = useTranslation()
  const runNative = useNativeCommand()
  const model = useVideoListing(listing)
  const [detailId, setDetailId] = useState<number | null>(null)

  const count = (value: number) => value.toLocaleString(i18n.language)
  const filtered = model.search !== '' || model.folder !== ''
  // 首启 — the library page with nothing in it and folders to add — is the one
  // empty state that is the whole screen rather than a state of the list, so it
  // is drawn large and says which files it can read at all.
  const firstRun =
    listing === 'library' &&
    !filtered &&
    model.videos.length === 0 &&
    !model.loading &&
    model.error === null

  const chooseFolders = async (): Promise<void> => {
    const outcome = await runNative('path.chooseDirectory', { multiple: true })
    if (!outcome.ok) return
    const value = outcome.value as { paths?: unknown }
    const paths = Array.isArray(value.paths)
      ? value.paths.filter((path): path is string => typeof path === 'string')
      : []
    if (paths.length > 0) await model.addFolders(paths)
  }

  const actions = {
    details: (video: Video) => setDetailId(video.id),
    play: (video: Video) => void model.play(video),
    favorite: (video: Video) => void model.toggleFavorite(video),
    // The browser build has no folder window to show, so the control is left
    // out of the row rather than drawn and doing nothing.
    ...(model.canReveal
      ? { reveal: (video: Video) => void model.reveal(video) }
      : {}),
  }

  return (
    <PageFrame>
      {(model.error !== null || model.playFailure !== null) && (
        <ListingNotices
          error={model.error}
          playFailure={model.playFailure}
          onRetry={model.retry}
          onDismissError={model.dismissError}
          onDismissPlayFailure={model.dismissPlayFailure}
        />
      )}

      <LibraryToolbar
        folders={model.folders}
        search={model.search}
        folder={model.folder}
        sort={model.sort}
        viewMode={model.viewMode}
        onSearchChange={model.setSearch}
        onFolderChange={model.setFolder}
        onSortChange={model.setSort}
        onViewModeChange={model.setViewMode}
        disabled={model.loading}
        actions={
          listing === 'library' ? (
            <DirectoryActions
              iconOnly
              busy={model.scanning}
              onAdd={() => void chooseFolders()}
              onRescan={() => void model.startScan()}
              onRegenerate={() => void model.rebuildThumbnails()}
            />
          ) : undefined
        }
      />

      {/* How much there is. It is not the number of cards below — the page holds
          one page of a list — and it is said here, above the list, because it is
          a statement about the library rather than about the page. Nothing is
          said until the backend has answered, since a count of nothing is a
          claim. */}
      {!model.loading && model.error === null && (
        <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {t('videoCount', { countText: count(model.total) })}
        </p>
      )}

      <div className="min-h-0 flex-1 flex flex-col">
        {model.loading ? (
          <p className="py-8 text-muted-foreground">{t('loading')}</p>
        ) : model.videos.length === 0 && model.error === null ? (
          <ScrollViewport>
            <EmptyState
              variant={firstRun ? 'hero' : 'plain'}
              icon={
                filtered ? <SearchX /> : firstRun ? <FolderPlus /> : <VideoOff />
              }
              title={
                filtered
                  ? t('noMatch')
                  : listing === 'favorites'
                    ? t('emptyFavorites')
                    : t('empty')
              }
              message={
                filtered
                  ? t('noMatchHelp')
                  : listing === 'favorites'
                    ? t('favoritesHelp')
                    : t('welcome')
              }
              hints={firstRun ? [t('welcomeFormats')] : undefined}
              action={
                filtered ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      model.setSearch('')
                      model.setFolder('')
                    }}
                  >
                    {t('clear')}
                  </Button>
                ) : (
                  listing === 'library' && (
                    <Button onClick={() => void chooseFolders()}>
                      <FolderPlus aria-hidden="true" />
                      {t('add')}
                    </Button>
                  )
                )
              }
            />
          </ScrollViewport>
        ) : (
          <ScrollViewport
            key={`${model.search}|${model.folder}|${model.sort}|${model.page}`}
            style={hoverRoomStyle}
            className="min-h-0 flex-1 overscroll-contain"
            tabIndex={0}
            aria-label={t(listing === 'favorites' ? 'favorites' : 'library')}
          >
            <VideoBoard
              videos={model.videos}
              viewMode={model.viewMode}
              busy={false}
              actions={actions}
              lastPlayedId={null}
            />
          </ScrollViewport>
        )}
      </div>

      {/* Which part of the list is on screen, and the way to the rest of it. It
          is the footer's because it is about the page, not about the library; a
          list that fits on one page has no footer at all. */}
      <Pagination
        index={model.page}
        total={model.total}
        onPageChange={model.turnTo}
        className="shrink-0 mt-4"
      />

      {detailId !== null && (
        <VideoDetailDialog
          videoId={detailId}
          canReveal={model.canReveal}
          onPlay={model.play}
          onToggleFavorite={model.toggleFavorite}
          onReveal={model.reveal}
          onClose={() => setDetailId(null)}
        />
      )}
    </PageFrame>
  )
}
