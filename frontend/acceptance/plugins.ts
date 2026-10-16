import exampleEntry from '../../examples/plugins/hello-page/interface.js?raw';
import type {
  AppError,
  PluginBootstrap,
  PluginInstallPreview,
} from '../src/shared/api';

/**
 * The plugins on disk, as this stand-in backend holds them.
 *
 * Here rather than in the fixture's switch because the list is a state and not
 * an answer: every lifecycle command answers with the whole of it as it now
 * stands — that is what the kernel does, and a page that redrew from anything
 * else could draw two answers contradicting each other. Keeping the list beside
 * the cases is also what lets uninstalling be a removal rather than a flag.
 *
 * What a walkthrough is about is the interface: the rows, the dialogs, the
 * question that carries a count. The rules behind all of it are the kernel's,
 * held by its own Rust tests, so nothing here reads a manifest or checks an
 * entry. A source picked from the picker becomes the plugin that source is
 * named after, which is how a pre-flight is reachable without a real plugin on
 * disk to point the picker at.
 *
 * Four plugins are here from the start, because those are the four rows the
 * page is a page of: the cover plugin (on, body half only), the example plugin
 * (on, interface half), one the user switched off, and one whose manifest did
 * not validate. A fixture holding only the first would leave three quarters of
 * the page unreachable to a walkthrough — and one holding no plugin with an
 * interface would leave the interface half unreachable to the window, which is
 * the half a page can mount and a body-only plugin cannot.
 */

/**
 * The example plugin's entry, and the one path this copy can really serve.
 *
 * `examples/plugins/hello-page/` is in this repository and is what a plugin
 * author copies; reading its text here is what makes the interface a
 * walkthrough mounts the plugin that ships rather than a second copy of it
 * written for the fixture, which would be free to drift from the thing an
 * author is given. `assets.ts` turns the text into a module a browser will
 * import, in place of the file the kernel would read off a disk.
 *
 * The plugin is body-less on purpose, and so is the cover plugin: a plugin has
 * one half or the other, and a fixture that gave both to one of them would be
 * showing a shape the kernel does not have.
 */
const EXAMPLE_ENTRY = 'hello-page/interface.js';

/** The source of a plugin's interface, for the paths this copy has one for. */
export function entrySource(path: string): string | undefined {
  return path === EXAMPLE_ENTRY ? exampleEntry : undefined;
}

function plugin(
  id: string,
  name: string,
  overrides: Partial<PluginBootstrap> = {},
): PluginBootstrap {
  return {
    id,
    name,
    author: 'someone',
    capabilities: [],
    entry: `${id}/index.js`,
    hasBody: false,
    enabled: true,
    failure: null,
    ...overrides,
  };
}

let installed: PluginBootstrap[] = [
  plugin('cover-fetcher', 'Cover Fetcher', {
    author: 'Enjoy',
    capabilities: ['fetch', 'storage'],
    // No interface: the cover plugin is a body and nothing else, and the kernel
    // answers with no entry for it. The default entry a plugin is given would
    // be a file that is not there, and a walkthrough would read the row this
    // plugin is *not* in — a plugin that failed to load — as the row it is in.
    entry: null,
    hasBody: true,
  }),
  plugin('hello-page', 'Hello page', {
    author: 'Enjoy',
    entry: EXAMPLE_ENTRY,
  }),
  plugin('watch-log', 'Watch log', { enabled: false }),
  plugin('broken-one', 'Broken one', {
    entry: null,
    failure: {
      code: 'plugin.manifest.api_too_new',
      params: { plugin: 'Broken one', required: '2', supported: '1' },
    },
  }),
];

/** How many rows of the library each plugin wrote, for the uninstall question. */
const rows = new Map<string, number>([['cover-fetcher', 128]]);

/** What the source a user picked turns out to hold. */
function fromSource(source: string): PluginBootstrap {
  const name = source.replace(/^.*[\\/]/, '').replace(/\.zip$/i, '');
  const id = name || 'cover-fetcher';
  return plugin(id, id === 'cover-fetcher' ? 'Cover Fetcher' : id, {
    author: 'Enjoy',
    capabilities: ['fetch'],
    hasBody: true,
  });
}

/** Every installed plugin, as the kernel answers with it: copies, not the list. */
function listed(): PluginBootstrap[] {
  return installed.map((entry) => ({ ...entry }));
}

export function list(): PluginBootstrap[] {
  return listed();
}

export function setEnabled(
  pluginId: string,
  enabled: boolean,
): PluginBootstrap[] {
  installed = installed.map((entry) =>
    entry.id === pluginId ? { ...entry, enabled } : entry,
  );
  return listed();
}

export function preview(source: string): PluginInstallPreview {
  const entry = fromSource(source);
  if (installed.some((held) => held.id === entry.id)) {
    // The one refusal a pre-flight can hit, in the kernel's own words: an id is
    // what a plugin is found under, and two plugins cannot share one.
    throw {
      code: 'plugin.install.exists',
      params: { plugin: entry.id },
      errorId: 'acceptance',
    } satisfies AppError;
  }
  return { destination: `/acceptance/plugins/${entry.id}`, plugin: entry };
}

export function install(source: string): PluginBootstrap[] {
  const entry = fromSource(source);
  if (!installed.some((held) => held.id === entry.id)) {
    installed = [...installed, entry];
    rows.set(entry.id, 0);
  }
  return listed();
}

export function uninstall(
  pluginId: string,
  deleteContent: boolean,
): PluginBootstrap[] {
  installed = installed.filter((entry) => entry.id !== pluginId);
  if (deleteContent) rows.delete(pluginId);
  return listed();
}

export function contentRows(pluginId: string): number {
  return rows.get(pluginId) ?? 0;
}

/**
 * Safe mode: every plugin off, and none of them gone.
 *
 * What the kernel does is put the enable record aside rather than rewrite
 * anything (ADR 0044 §7), and what a walkthrough sees of it is the same list
 * with a different word on every row.
 */
export function safeMode(): PluginBootstrap[] {
  installed = installed.map((entry) => ({ ...entry, enabled: false }));
  return listed();
}
