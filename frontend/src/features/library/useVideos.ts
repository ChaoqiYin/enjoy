import type { UseQueryResult } from '@tanstack/react-query';
import type { Video } from '../../shared/api';
import { useLibraryContext } from './LibraryProvider';

/**
 * The video collection, and which of its cards carries the "last played"
 * marker. Everything about *one* video is in `useVideoActions`.
 *
 * The type is the interface, and it is declared here, by the module that hands
 * it out: `useLibrary` builds its slice against it, so a page is held to what
 * this says rather than to what the assembly happens to hold. What "narrow"
 * means here is exactly that — the context still carries everything, and what a
 * consumer may name is one slice of it.
 */
export type Videos = {
  videos: UseQueryResult<Video[]>;
  lastPlayedId: number | null;
};

export function useVideos(): Videos {
  return useLibraryContext().videos;
}
