import * as covers from './covers';
import type { VideoField } from '../src/shared/api';

/**
 * What the plugins have written about a record, and what running one's action
 * does to it.
 *
 * This copy keeps no library, so nothing can put a field in a table for real —
 * and without one the panel's plugin row and the source badge beside it are
 * drawn in no browser at all, which is the one thing jsdom cannot stand in for.
 *
 * The cover is the field, and it is the plugin's action that puts it there:
 * running the menu item is what makes the plugin go and find one, and reading
 * the fields afterwards is what the panel does. So the two commands are the two
 * halves of one story here, exactly as they are in the kernel — the action is
 * the errand, and the refresh is what the library then holds.
 *
 * It lives here rather than in the fixture's switch because it is one command's
 * whole answer, and `web-fixture.ts` is at the length its module keeps.
 */

/**
 * What the plugins have written about one record, as the panel reads it.
 *
 * Every record a plugin has not found a cover for answers with nothing, and the
 * panel draws no row for an empty answer — so a walkthrough sees the panel it
 * saw before, on all of them.
 */
export function refresh(path: string): VideoField[] {
  const cover = covers.coverOf(path);
  if (cover === null) return [];
  return [{ key: 'cover', value: cover, source_plugin: 'cover-fetcher' }];
}

/**
 * The plugin's own menu item: it goes and finds a cover for this record, and the
 * answer is the fields as they now stand.
 *
 * One answer rather than two commands from the interface, which is what the
 * kernel's own command does — an action is followed by the refresh in the same
 * errand, so the panel that opened the menu draws the video the action left
 * behind.
 */
export function runAction(path: string): VideoField[] {
  covers.find(path);
  return refresh(path);
}
