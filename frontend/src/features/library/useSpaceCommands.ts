import { useLibraryContext } from './LibraryProvider';

/**
 * The four commands that change what the library *is* rather than what it
 * holds. The list of spaces and the current one belong to `SpaceProvider`.
 */
export type SpaceCommands = {
  createSpace: (name: string) => Promise<void>;
  renameSpace: (target: number, name: string) => Promise<void>;
  removeSpace: (target: number) => Promise<void>;
  switchSpace: (target: number) => Promise<void>;
};

export function useSpaceCommands(): SpaceCommands {
  return useLibraryContext().spaceCommands;
}
