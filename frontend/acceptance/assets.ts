import * as covers from './covers';
import * as plugins from './plugins';

/**
 * The asset protocol, put behind the two kinds of file this copy has to stand
 * in for.
 *
 * In the application every one of them is a path on this machine and the
 * protocol behind `convertFileSrc` turns it into something the webview can
 * read. A browser has no such thing: what the fixture installs answers every
 * path with `asset://localhost/...`, and a picture behind that address is a
 * broken image and a module behind it is a failed import. So a walkthrough
 * without this wrapper would be reading the harness — an interface that never
 * mounted and a card that never drew — rather than the application.
 *
 * One wrapper and not one per directory: two of them would each have to leave
 * the other's paths alone, and which one saw a path first would decide what
 * happened to it. The directories are named here instead, and what is behind
 * each of them is the module that holds that state.
 *
 * What it does **not** stand in for is worth saying, because it is the whole of
 * what a walkthrough can conclude from it: a plugin's interface here is the
 * text of the example plugin in this repository (`examples/plugins/`), served
 * as a module rather than read off a disk, and a cover is one flat picture
 * rather than bytes that were fetched and written. That a plugin's directory is
 * read, validated, enabled and its entry reached for **is** exercised — by the
 * kernel's own tests, on a real directory and a real wasm module; what is not
 * is the filesystem underneath, which a browser does not have.
 */

type Convert = (path: string, protocol?: string) => string;

/**
 * A module a browser can import, out of source text.
 *
 * A `data:` URL is the one address that is a module and needs nothing to serve
 * it. It is also why the example plugin's interface imports nothing: a relative
 * specifier inside a `data:` URL has nothing to resolve against, which is the
 * same rule the application has for another reason — a plugin's entry is a file
 * outside the kernel's build, so it has no bundler in front of it either.
 */
function moduleUrl(source: string): string {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

/** The window's asset protocol, put behind the two directories above. */
export function installAssetSrc(): void {
  const internals = (
    window as unknown as { __TAURI_INTERNALS__?: { convertFileSrc?: Convert } }
  ).__TAURI_INTERNALS__;
  const original = internals?.convertFileSrc;
  if (!internals || !original) return;
  internals.convertFileSrc = (path, protocol) => {
    const picture = covers.pictureOf(path);
    if (picture !== undefined) return picture;
    const entry = plugins.entrySource(path);
    if (entry !== undefined) return moduleUrl(entry);
    return original(path, protocol);
  };
}
