import type { Video } from '../../shared/api';
import { useLibraryContext } from './LibraryProvider';

/**
 * What a page can ask of one video.
 *
 * All of them answer with nothing and report what went wrong as a notice, so a
 * caller's own state never has to carry a failure: the page that draws the card
 * is not the place a library-wide failure belongs.
 *
 * `runPlugin` is the one that names something other than the video — the plugin
 * the user picked out of the menu — because that is what the user did: they
 * chose a plugin's own action, not an action of this application's.
 */
export type VideoActions = {
  play: (video: Video) => Promise<void>;
  toggleFavorite: (video: Video) => Promise<void>;
  toggleShared: (video: Video) => Promise<void>;
  reveal: (video: Video) => Promise<void>;
  refreshInfo: (video: Video) => Promise<void>;
  regenerateThumbnail: (video: Video) => Promise<void>;
  removeVideo: (video: Video) => Promise<void>;
  runPlugin: (video: Video, pluginId: string) => Promise<void>;
};

export function useVideoActions(): VideoActions {
  return useLibraryContext().videoActions;
}
