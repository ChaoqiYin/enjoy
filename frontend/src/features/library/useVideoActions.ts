import type { Video } from '../../shared/api';
import { useLibraryContext } from './LibraryProvider';

/**
 * What a page can ask of one video.
 *
 * All six answer with nothing and report what went wrong as a notice, so a
 * caller's own state never has to carry a failure: the page that draws the card
 * is not the place a library-wide failure belongs.
 */
export type VideoActions = {
  play: (video: Video) => Promise<void>;
  toggleFavorite: (video: Video) => Promise<void>;
  reveal: (video: Video) => Promise<void>;
  refreshInfo: (video: Video) => Promise<void>;
  regenerateThumbnail: (video: Video) => Promise<void>;
  removeVideo: (video: Video) => Promise<void>;
};

export function useVideoActions(): VideoActions {
  return useLibraryContext().videoActions;
}
