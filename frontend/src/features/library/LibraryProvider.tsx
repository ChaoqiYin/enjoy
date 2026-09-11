import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useLibrary } from './useLibrary';

const LibraryContext = createContext<ReturnType<typeof useLibrary> | null>(
  null,
);
export function LibraryProvider({ children }: { children: ReactNode }) {
  const library = useLibrary();
  return (
    <LibraryContext.Provider value={library}>
      {children}
    </LibraryContext.Provider>
  );
}
export function useLibraryContext() {
  const library = useContext(LibraryContext);
  if (!library) throw new Error('LibraryProvider is required');
  return library;
}
