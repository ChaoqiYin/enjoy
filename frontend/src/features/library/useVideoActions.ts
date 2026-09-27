import { useLibraryContext } from './LibraryProvider';

/** What a page can ask of one video. */
export function useVideoActions() {
  const {
    play,
    toggleFavorite,
    reveal,
    refreshInfo,
    regenerateThumbnail,
    removeVideo,
  } = useLibraryContext();
  return {
    play,
    toggleFavorite,
    reveal,
    refreshInfo,
    regenerateThumbnail,
    removeVideo,
  };
}
