import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { navigate } from 'cordis-app/ui'
import { ScrollViewport } from '../shared/ScrollViewport'
import { Button } from '../shared/ui/button'
import { PageFrame } from '../features/layout/PageFrame'
import { ConnectionDetails } from '../features/share/ConnectionDetails'
import { DeviceList } from '../features/share/DeviceList'
import { ListWarnings } from '../features/share/ListWarnings'
import { PasswordDetails } from '../features/share/PasswordDetails'
import { ShareNotices } from '../features/share/ShareNotices'
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
 * The list is the listing every page reads, asked for the records marked as
 * shared (`only=shared`) so paging, search, ordering and the three views mean
 * here what they mean in the library. The toolbar's action is the page's own:
 * starting or stopping the service. Everything else is a block that is handed
 * the facts it draws, which keeps the ordering of the page readable here.
 */
export function SharePage() {
  const { t, i18n } = useTranslation()
  const share = useShare()
  const copy = useCopy()
  const model = useVideoListing('share')
  const [detailId, setDetailId] = useState<number | null>(null)

  const running = share.status?.running ?? false
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
        actions={
          <Button
            variant={running ? 'secondary' : 'primary'}
            // A service over a list it has not read, could not read or found
            // empty is a port a device can connect to and find nothing on: the
            // interface keeps that from happening.
            disabled={
              share.busy ||
              (!running &&
                (model.loading || model.error !== null || model.total === 0))
            }
            onClick={() => void (running ? share.stop() : share.start())}
          >
            {running ? t('stopSharing') : t('startSharing')}
          </Button>
        }
      />

      <ScrollViewport
        className="min-h-0 space-y-4"
        style={hoverRoomStyle}
        aria-label={t('sharePage')}
      >
        {/* The port is what can surprise: 4918 is what was asked for, and what
            the service ends up on is whatever was free. */}
        <p>
          {running
            ? t('sharingOn', { port: share.status?.port })
            : t('sharingOff')}
        </p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t('shareListTitle')}</h2>
          <ListWarnings
            running={running}
            missingFiles={share.status?.missingFiles ?? 0}
            listChanged={share.status?.listChanged ?? false}
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
              <p className="text-sm text-muted-foreground tabular-nums">
                {t('videoCount', {
                  countText: model.total.toLocaleString(i18n.language),
                })}
              </p>
              <VideoBoard
                videos={model.videos}
                viewMode={model.viewMode}
                busy={false}
                actions={actions}
                lastPlayedId={null}
              />
              <Pagination
                index={model.page}
                total={model.total}
                onPageChange={model.turnTo}
              />
            </>
          )}
        </section>

        <ConnectionDetails
          running={running}
          port={share.status?.port ?? null}
          addresses={share.status?.addresses ?? []}
          username={share.status?.username ?? ''}
          onCopy={(text) => void copy(text)}
        >
          <PasswordDetails
            password={share.status?.password ?? ''}
            busy={share.busy}
            needsRestart={share.status?.needsRestart ?? false}
            onCopy={(text) => void copy(text)}
            onRegenerate={() => void share.regeneratePassword()}
          />
        </ConnectionDetails>

        {running && (
          <DeviceList devices={share.status?.devices ?? []} />
        )}
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
