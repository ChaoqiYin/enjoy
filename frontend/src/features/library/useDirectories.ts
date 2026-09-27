import type { UseQueryResult } from '@tanstack/react-query';
import { useLibraryContext } from './LibraryProvider';

/**
 * The folders the library is built from, and the commands over them — including
 * the two library-wide maintenance passes, which are what a page offers beside
 * the folder list.
 */
export type Directories = {
  directories: UseQueryResult<string[]>;
  addDirectories: (paths: string[]) => Promise<void>;
  removeDirectory: (path: string) => Promise<void>;
  rescan: () => Promise<void>;
  regenerateAllThumbnails: () => Promise<void>;
};

export function useDirectories(): Directories {
  return useLibraryContext().directories;
}
