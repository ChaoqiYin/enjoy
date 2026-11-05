import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { navigate } from 'cordis-app/ui'
import { ScrollViewport } from '../shared/ScrollViewport'
import { Button } from '../shared/ui/button'
import { PageFrame } from '../features/layout/PageFrame'
import { ListWarnings } from '../features/share/ListWarnings'
import { ShareNotices } from '../features/share/ShareNotices'
import { ShareServicePanel } from '../features/share/ShareServicePanel'
import { useShare } from '../features/share/ShareProvider'
import { useCopy } from '../features/share/useCopy'
import { EmptyState } from '../features/library/EmptyState'
import { LibraryToolbar } from '../features/library/LibraryToolbar'
import { listingActions } from '../features/library/listingActions'
import { ListingNotices } from '../features/library/ListingNotices'
import { Pagination } from '../features/library/Pagination'
import { VideoBoard } from '../features/library/VideoBoard'
import { VideoDetailDialog } from '../features/library/VideoDetailDialog'
import { hoverRoomStyle } from '../features/library/videoCardBox'
import { useVideoListing } from '../features/library/useVideoListing'

/**
 * The share service's page: what is being offered, how a client reaches it, and
 * who has asked.
 *
 * It is drawn in two columns. The list is the wide one — it is the listing
 * every page reads, asked for the records marked as shared (`only=shared`), so
 * paging, search, ordering and the three views mean here what they mean in the
 * library. The service is a card beside it: its state, the address and
 * credentials a television is given, and the clients heard from. Keeping the
 * card out of the page's vertical flow means a television can be set up while
 * the list is empty, and the address stays on the first screen when the list is
 * long. Under `xl` the two stack, with the card first, because starting and
 * stopping is what the page is for.
 *
 * Everything but the list is a block handed the facts it draws, which keeps the
 * ordering of the page readable here.
 */
export function SharePage() {
  const { t, i18n } = useTranslation()
  const share = useShare()
  const copy = useCopy()
  const model = useVideoListing('share')
  const [detailId, setDetailId] = useState<number | null>(null)

  const running = share.status?.running ?? false
  const pendingChanges = share.status?.pendingChanges ?? { added: [], removed: [] }
  const pendingAdded = new Set(pendingChanges.added)
  const filtered = model.search !== '' || model.folder !== ''
  const empty =
    !model.loading && model.error === null && model.videos.length === 0
  const emptyList = empty && !filtered && model.total === 0
  const showList = !model.loading && model.error === null && !empty

  const actions = listingActions(model, (video) => setDetailId(video.id))

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
      <ShareNotices
        error={share.error}
        onRetry={share.retry}
        onDismiss={share.dismissError}
      />

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
      />

      <ScrollViewport
        className="min-h-0"
        style={hoverRoomStyle}
        aria-label={t('sharePage')}
      >
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="order-2 min-w-0 space-y-3 xl:order-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold">{t('shareListTitle')}</h2>
              {showList && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {t('videoCount', {
                    countText: model.total.toLocaleString(i18n.language),
                  })}
                </p>
              )}
            </div>
            <ListWarnings
              running={running}
              missingFiles={share.status?.missingFiles ?? 0}
              listChanged={share.status?.listChanged ?? false}
              pendingChanges={pendingChanges}
            />
            {model.loading ? (
              <p className="py-8 text-muted-foreground">{t('loading')}</p>
            ) : empty ? (
              <EmptyState
                icon={<Share2 />}
                title={emptyList ? t('shareListEmpty') : t('noMatch')}
                action={
                  emptyList ? (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => navigate('/')}
                    >
                      {t('shareListEmptyAction')}
                    </Button>
                  ) : (
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
                  )
                }
              />
            ) : null}

            {showList && (
              <>
                <VideoBoard
                  videos={model.videos}
                  viewMode={model.viewMode}
                  busy={false}
                  actions={actions}
                  lastPlayedId={null}
                  pendingSharedPaths={pendingAdded}
                />
                <Pagination
                  index={model.page}
                  total={model.total}
                  onPageChange={model.turnTo}
                />
              </>
            )}
          </section>

          <ShareServicePanel
            className="order-1 xl:order-2"
            status={share.status}
            busy={share.busy}
            onStart={() => void share.start()}
            onStop={() => void share.stop()}
            onRestart={() => void share.restart()}
            onCopy={(text) => void copy(text)}
            onRegeneratePassword={() => void share.regeneratePassword()}
          />
        </div>
      </ScrollViewport>

      {detailId !== null && (
        <VideoDetailDialog
          videoId={detailId}
          canReveal={model.canReveal}
          onPlay={model.play}
          onToggleFavorite={model.toggleFavorite}
          onToggleShared={model.toggleShared}
          onReveal={model.reveal}
          onClose={() => setDetailId(null)}
        />
      )}
    </PageFrame>
  )
}
