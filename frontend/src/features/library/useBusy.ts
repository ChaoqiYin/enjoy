import { useLibraryContext } from './LibraryProvider';

/**
 * Whether the library is carrying out a command right now.
 *
 * Its own module because it is asked on its own: a button that must not be
 * pressed twice, a card that must not be acted on while a pass is running. It
 * is not the scan's boolean — a scan is one of the things that can be in flight,
 * not the only one.
 */
export function useBusy() {
  const { busy } = useLibraryContext();
  return { busy };
}
