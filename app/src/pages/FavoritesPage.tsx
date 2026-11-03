import type { ReactElement } from 'react'
import { VideoListingPage } from '../features/library/VideoListingPage'

/** `/favorites` — the same collection, narrowed by the backend. */
export function FavoritesPage(): ReactElement {
  return <VideoListingPage listing="favorites" />
}
