import { isTauri } from '@tauri-apps/api/core';
import { libraryApi } from '../../shared/api';
import type { Space } from '../../shared/api';

/**
 * Reads the space the interface is showing, before the interface is rendered —
 * the same moment the language is read, and for the same reason: every library
 * query and every action is addressed to a space, so until one is known there
 * is nothing useful to ask for. A placeholder space would only be a wrong
 * answer shaped like a right one.
 *
 * The browser-only development entry point has no backend to ask, so it stands
 * in for the single space a real database would hold there.
 */
export async function readCurrentSpace(): Promise<Space> {
  if (!isTauri()) return { id: 1, name: 'Enjoy' };
  return libraryApi.currentSpace();
}
