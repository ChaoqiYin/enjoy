import type { ReactElement } from 'react'
import { VideoListingPage } from '../features/library/VideoListingPage'

/** `/` — the whole library of the current space. */
export function LibraryPage(): ReactElement {
  return <VideoListingPage listing="library" />
}
