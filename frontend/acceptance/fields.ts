import { videos } from './records';
import type { VideoField } from '../src/shared/api';

/**
 * What a plugin is pretending to have written about the first record.
 *
 * A declared lie, in the shape `missingFromDisk` is: this copy keeps no library,
 * so nothing can put a field in a table for real, and without one the panel's
 * plugin row and the source badge beside it are drawn in no browser at all —
 * which is the one thing jsdom cannot stand in for. The first record is the one
 * nearest to hand, and the plugin it names is the cover plugin the whole design
 * is written around.
 *
 * It lives here rather than in the fixture's switch because it is one command's
 * whole answer, and `web-fixture.ts` is at the length its module keeps.
 */
const pluginFields: VideoField[] = [
  {
    key: 'cover',
    value: '/acceptance/covers/video-01.jpg',
    source_plugin: 'cover-fetcher',
  },
];

/**
 * What the plugins have written about one record.
 *
 * Every other record answers with nothing, and the panel draws no row for an
 * empty answer — so a walkthrough sees the panel it saw before, on all of them.
 */
export function refresh(path: string): VideoField[] {
  return path === videos[0].path ? pluginFields : [];
}
