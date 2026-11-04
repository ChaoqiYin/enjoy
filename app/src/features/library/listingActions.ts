import type { Video } from '../../shared/api'
import type { VideoActionHandlers } from './VideoActions'
import type { VideoListingState } from './useVideoListing'

/**
 * The actions the listing pages hand their cards.
 *
 * Both pages read the same records and offer the same verbs; only what "open
 * the details" means belongs to the page, since that is the one action that
 * changes the page's own state rather than the record's. Building the set in
 * one place keeps the two pages from disagreeing about which actions exist or
 * how a reveal control is left out where the shell cannot show a folder.
 */
export function listingActions(
  model: VideoListingState,
  openDetails: (video: Video) => void,
): VideoActionHandlers {
  return {
    details: openDetails,
    play: (video: Video) => void model.play(video),
    favorite: (video: Video) => void model.toggleFavorite(video),
    share: (video: Video) => void model.toggleShared(video),
    ...(model.canReveal
      ? { reveal: (video: Video) => void model.reveal(video) }
      : {}),
  }
}
