import { useLibraryContext } from './LibraryProvider';

/**
 * The four commands that change what the library *is* rather than what it
 * holds. The list of spaces and the current one belong to `SpaceProvider`.
 */
export function useSpaceCommands() {
  const { createSpace, renameSpace, removeSpace, switchSpace } =
    useLibraryContext();
  return { createSpace, renameSpace, removeSpace, switchSpace };
}
