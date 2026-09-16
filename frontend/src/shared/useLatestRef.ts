import { useEffect, useRef } from 'react';

/**
 * Tracks the newest value in a ref without making it a dependency. Callbacks
 * arrive as inline arrows, so their identity changes on every render; putting
 * one straight into an effect's dependency array would tear down and rebuild
 * whatever that effect set up, over and over — a countdown timer written that
 * way restarts forever and never fires. Reading the callback through a ref
 * keeps an effect's dependencies down to the things that should genuinely
 * restart it.
 */
export function useLatestRef<T>(value: T) {
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  return latest;
}
