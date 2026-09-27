import { useLibraryContext } from './LibraryProvider';

/**
 * The folders the library is built from, and the commands over them — including
 * the two library-wide maintenance passes, which are what a page offers beside
 * the folder list.
 */
export function useDirectories() {
  const {
    directories,
    addDirectories,
    removeDirectory,
    rescan,
    regenerateAllThumbnails,
  } = useLibraryContext();
  return {
    directories,
    addDirectories,
    removeDirectory,
    rescan,
    regenerateAllThumbnails,
  };
}
