import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { libraryApi } from '../../shared/api';
import type { Space } from '../../shared/api';

/**
 * Which space the interface is showing, and the list it is one of.
 *
 * The current space is held here rather than fetched on every render: it is the
 * answer every library query and every action is addressed to, so it has to be
 * in hand rather than awaited (ADR 0012). Reading it is this layer's job; the
 * three commands that change the set of spaces are the library's, because what
 * they move — the notice, the busy flag, the caches — is the library's.
 */
function useSpaceState(initialSpace: Space) {
  const [space, setSpace] = useState(initialSpace);
  const spaces = useQuery({
    queryKey: ['spaces'],
    queryFn: () => libraryApi.listSpaces(),
    retry: false,
  });

  return {
    space,
    spaces,
    /**
     * Moves the interface into a space that is known to exist.
     *
     * Every command that changes the set of spaces answers with the one to show
     * next — the new one when one is created, another real one when the space
     * being shown is deleted — so there is one rule rather than a different
     * guess at each call site, and no moment where the interface is showing a
     * space that is not there.
     *
     * It takes the space rather than the promise that will produce it, so that
     * a caller which has to do something with the answer first — the library
     * does — can wait for it and still decide before the interface moves.
     *
     * Nothing is read again here. Moving and re-reading are not the same event:
     * a rename never moves the interface, and it still changes this list, so the
     * refresh belongs to the command rather than to the move — the library is
     * where it is done.
     */
    adopt(next: Space) {
      setSpace(next);
    },
  };
}

const SpaceContext = createContext<ReturnType<typeof useSpaceState> | null>(
  null,
);

/**
 * Holds the space the interface is showing, above the library's own provider,
 * because the library is read and written *within* a space: every query it
 * caches and every action it issues is addressed to this one (ADR 0012).
 *
 * The space it starts on arrives from the entry point rather than being fetched
 * here, so that a failure to read it is reported the same way a failure to read
 * the language is, instead of leaving the interface waiting on a provider.
 */
export function SpaceProvider({
  initialSpace,
  children,
}: {
  initialSpace: Space;
  children: ReactNode;
}) {
  const spaces = useSpaceState(initialSpace);
  return (
    <SpaceContext.Provider value={spaces}>{children}</SpaceContext.Provider>
  );
}

function useSpaceContext() {
  const spaces = useContext(SpaceContext);
  if (!spaces) throw new Error('SpaceProvider is required');
  return spaces;
}

/** The one space the interface is showing. */
export function useSpace() {
  return useSpaceContext().space;
}

/** Every space, and which of them the interface is showing. */
export function useSpaces() {
  const { space, spaces } = useSpaceContext();
  return { space, spaces };
}

/** Moves the interface into the space a command answered with. */
export function useAdoptSpace() {
  return useSpaceContext().adopt;
}
