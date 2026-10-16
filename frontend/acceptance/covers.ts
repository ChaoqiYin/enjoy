import { videos } from './records';

/**
 * The covers a plugin is pretending to have found, and the picture the window
 * draws one as.
 *
 * A declared lie, in the shape `missingFromDisk` is: this copy keeps no library,
 * so nothing goes and fetches an image or writes one under `$APPDATA/covers/`,
 * and the kernel's half of that is held by its own Rust tests — the address a
 * plugin answers with, the fetch, the extension it is written under, and the
 * path that reaches the table. What a walkthrough has to be able to read is the
 * other half: that a plugin's cover is the picture drawn on the card, and that
 * the panel says which plugin it came from. Neither is visible without a picture
 * to draw.
 *
 * The picture is a `data:` URI and the asset protocol is wrapped to hand it
 * back (`assets.ts` is where that one wrapper lives). A browser has nothing
 * behind `asset://localhost/...` — that is what the
 * `convertFileSrc` the fixture installs answers every path with — so an
 * unwrapped cover would draw as a broken image, and a walkthrough would be
 * reading the harness rather than the application. What the wrapper stands in
 * for is the asset protocol itself, which in the application is the thing that
 * turns a path under the covers directory into bytes.
 *
 * Nothing is found until the plugin's action has been run. The cover is the
 * answer to that action, and a fixture that started with one would leave the
 * menu item's whole effect unreadable.
 */

/**
 * The picture every cover here is drawn as.
 *
 * A flat magenta, which is a colour nothing in this interface is and nothing on
 * a screen naturally is: whether the cover reached the card is then a question
 * with an answer, rather than a comparison between two greys.
 */
const PICTURE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9">' +
    '<rect width="16" height="9" fill="#ff00ff"/></svg>',
)}`;

/** Where a cover is kept, in the shape the kernel writes one into. */
const DIRECTORY = '/acceptance/covers';

/** The records a plugin has found a cover for, by the path they are filed under. */
const found = new Set<string>();

function idOf(path: string): number | undefined {
  return videos.find((video) => video.path === path)?.id;
}

/**
 * The path the library holds for this record's cover, or null when there is
 * none — which is what the record carries and what the panel's field row says.
 */
export function coverOf(path: string): string | null {
  const id = idOf(path);
  return id !== undefined && found.has(path) ? `${DIRECTORY}/${id}.jpg` : null;
}

/** What the plugin's own action does: this record now has a cover. */
export function find(path: string): void {
  if (idOf(path) !== undefined) found.add(path);
}

/**
 * The picture behind one path, if it is a cover this copy has found — and
 * nothing at all for every other path, which is what leaves the rest of the
 * protocol to the conversion the fixture already installed.
 *
 * Read by `assets.ts`, which is where the one wrapper around `convertFileSrc`
 * lives: two modules each wrapping it would be two wrappers whose order decides
 * what happens, and a third would make it a guess.
 */
export function pictureOf(path: string): string | undefined {
  return path.startsWith(`${DIRECTORY}/`) ? PICTURE : undefined;
}
