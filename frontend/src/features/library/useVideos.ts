import { useLibraryContext } from './LibraryProvider';

/**
 * The video collection, and which of its cards carries the "last played"
 * marker. Everything about *one* video is in `useVideoActions`.
 */
export function useVideos() {
  const { videos, lastPlayedId } = useLibraryContext();
  return { videos, lastPlayedId };
}
