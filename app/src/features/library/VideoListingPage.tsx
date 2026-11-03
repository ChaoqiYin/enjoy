import { useState } from 'react'
import { Film, Heart, Play } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { VideoFilter } from '../../shared/api'
import { EmptyState } from './EmptyState'
import { LibraryToolbar } from './LibraryToolbar'
import { ListingNotices } from './ListingNotices'
import { Pagination } from './Pagination'
import { VideoBoard } from './VideoBoard'
import { VideoDetailDialog } from './VideoDetailDialog'
import { useVideoListing } from './useVideoListing'
import type { Listing } from './listing'

function emptyCopy(
  listing: Listing,
  filter: VideoFilter,
  t: TFunction,
): { title: string; message: string; icon: 'film' | 'heart' | 'play' } {
  if (listing === 'favorites' || filter === 'favorites') {
    return {
      title: t('emptyFavorites'),
      message: t('favoritesHelp'),
      icon: 'heart',
    }
  }
  if (filter === 'played') {
    return {
      title: t('emptyPlayed'),
      message: t('emptyPlayedHelp'),
      icon: 'play',
    }
  }
  return { title: t('empty'), message: t('welcome'), icon: 'film' }
}

/** The screen both listing routes share. The route decides which records it reads. */
export function VideoListingPage({ listing }: { listing: Listing }) {
  const { t, i18n } = useTranslation()
  const model = useVideoListing(listing)
  const [detailId, setDetailId] = useState<number | null>(null)
  const empty = emptyCopy(listing, model.filter, t)
  const countText = new Intl.NumberFormat(i18n.language).format(model.total)
  const Icon = empty.icon === 'heart' ? Heart : empty.icon === 'play' ? Play : Film

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">
          {t(listing === 'favorites' ? 'favorites' : 'library')}
        </h1>
        {!model.loading && model.error === null && model.total > 0 && (
          <p className="text-sm text-muted-foreground">
            {t('videoCount', { countText })}
          </p>
        )}
      </header>

      <LibraryToolbar
        listing={listing}
        sort={model.sort}
        filter={model.filter}
        viewMode={model.viewMode}
        onSortChange={model.setSort}
        onFilterChange={model.setFilter}
        onViewModeChange={model.setViewMode}
      />

      <ListingNotices
        error={model.error}
        playFailure={model.playFailure}
        onRetry={model.retry}
        onDismissError={model.dismissError}
        onDismissPlayFailure={model.dismissPlayFailure}
      />

      {model.loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {t('loading')}
        </div>
      ) : model.videos.length === 0 ? (
        model.error === null && (
          <EmptyState
            icon={<Icon className="size-7" />}
            title={empty.title}
            message={empty.message}
          />
        )
      ) : (
        <VideoBoard
          viewMode={model.viewMode}
          videos={model.videos}
          onPlay={model.play}
          onToggleFavorite={model.toggleFavorite}
          canReveal={model.canReveal}
          onReveal={model.reveal}
          onOpenDetail={(video) => setDetailId(video.id)}
        />
      )}

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

      <Pagination page={model.page} total={model.total} onTurn={model.turnTo} />
    </section>
  )
}
