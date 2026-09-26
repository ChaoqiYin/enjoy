import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { Space } from '../../shared/api';

const SpaceContext = createContext<Space | null>(null);

/**
 * Holds the space the interface is showing, above the library's own provider,
 * because the library is read and written *within* a space: every query it
 * caches and every action it issues is addressed to this one (ADR 0012).
 *
 * The value arrives from the entry point rather than being fetched here, so
 * that a failure to read it is reported the same way a failure to read the
 * language is, instead of leaving the interface waiting on a provider.
 */
export function SpaceProvider({
  space,
  children,
}: {
  space: Space;
  children: ReactNode;
}) {
  return (
    <SpaceContext.Provider value={space}>{children}</SpaceContext.Provider>
  );
}

export function useSpace() {
  const space = useContext(SpaceContext);
  if (!space) throw new Error('SpaceProvider is required');
  return space;
}
