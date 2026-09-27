import { useLibraryContext } from './LibraryProvider';

/**
 * Whether the library is carrying out a command right now.
 *
 * Its own module because it is asked on its own: a button that must not be
 * pressed twice, a card that must not be acted on while a pass is running. It
 * is not the scan's boolean — a scan is one of the things that can be in flight,
 * not the only one.
 *
 * One key, named here rather than copied out of the assembly: the module is
 * worth having because it is a module — a page imports the question it asks,
 * and a test replaces the answer without building a library.
 */
export type Busy = { busy: boolean };

export function useBusy(): Busy {
  return useLibraryContext().busy;
}
