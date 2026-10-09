import type { UseQueryResult } from '@tanstack/react-query';
import type { VideoPage } from '../../shared/api';
import { useLibraryContext } from './LibraryProvider';

/**
 * The listing the library is showing: the page of records the backend answered
 * with, where in that list the user has got to, and which of its cards carries
 * the "last played" marker. Everything about *one* video is in `useVideoActions`.
 *
 * The answer is one page and a count rather than every record of the space
 * (ADR 0016), and that is why the rest is here as well: a page index only means
 * something together with the list it is an index of, and that list is the
 * description the backend was asked. The index is handed out bound to it —
 * `turnTo` writes the place in the list being read, whatever list that is — so
 * the control that turns pages never has to know which listing it is standing
 * in, and can never write a place into another one.
 *
 * How the list is *ordered* is not here: the order is the header's own control,
 * read from the same view state by the page that draws it.
 *
 * The type is the interface, and it is declared here, by the module that hands
 * it out: `useLibrary` builds its slice against it, so a page is held to what
 * this says rather than to what the assembly happens to hold. What "narrow"
 * means here is exactly that — the context still carries everything, and what a
 * consumer may name is one slice of it.
 */
export type Videos = {
  videos: UseQueryResult<VideoPage>;
  lastPlayedId: number | null;
  /** Which page of the list is being read. */
  index: number;
  /** Turn to another page of the list being read. */
  turnTo: (index: number) => void;
  /**
   * The list this page is a page of, as one string: the description the backend
   * was asked, with the page on it.
   *
   * It is what a list is mounted against — mounting again is what starts a list
   * at its top — and it is what tells one answer from another. Two answers agree
   * here exactly when they are two answers to the same question, which is the
   * only way a page can tell "the user turned a page" from "the record is gone".
   */
  pageKey: string;
};

export function useVideos(): Videos {
  return useLibraryContext().videos;
}
