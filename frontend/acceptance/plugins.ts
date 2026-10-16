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
 * Three plugins are here from the start — one on with an interface, one the user
 * switched off, and one whose manifest did not validate — because those are the
 * three rows the page is a page of, and a fixture holding only the first would
 * leave two thirds of it unreachable to a walkthrough.
 */

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
    hasBody: true,
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
