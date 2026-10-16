import exampleEntry from '../../examples/plugins/hello-page/interface.js?raw';
import type { SettingValue } from '../src/plugins/mountPoints';
import type {
  AppError,
  PluginBootstrap,
  PluginInstallPreview,
  PluginSettingField,
  PluginSettingsGroup,
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

/** One field as a plugin declares it, which is a field without a value: the
 *  declaration is what the plugin says and the value is what the user said, and
 *  folding them into one record would mean rewriting the declaration every time
 *  a walkthrough typed in a box. */
type Declaration = Omit<PluginSettingField, 'value'>;

/**
 * What each plugin asks the user to fill in.
 *
 * The kernel draws the form from what the plugin itself declares, and this
 * stand-in has no plugin to ask — so the one declaration a walkthrough needs is
 * written out here, on the plugin that is running from the start. The others ask
 * for nothing, and that is what they really are: a plugin with no body cannot be
 * asked anything (the example one is an interface and nothing else), one that is
 * switched off is not running, and one whose manifest did not validate never
 * started.
 *
 * The field labels are the fixture's own words rather than translations: a
 * plugin's declaration arrives from the plugin, and the plugin is not in this
 * application's translation files.
 */
const declarations: [string, Declaration[]][] = [
  [
    'cover-fetcher',
    [
      { key: 'site', kind: 'text', label: 'Site', required: true },
      {
        key: 'folder',
        kind: 'directory',
        label: 'Covers folder',
        required: false,
      },
    ],
  ],
];

/**
 * What the user has filled in, by plugin and field key.
 *
 * One set for the whole library rather than one per space: a plugin's settings
 * are global (baseline §14.6), so the space a call names is carried to the
 * plugin and not into what is kept.
 */
const answers = new Map<string, string>();

/**
 * The plugins the window is running, which is not the same thing as the ones
 * that are switched on: nothing hot-plugs (spec #82 「不做热插拔」), so the
 * running set is fixed when the application starts and every lifecycle command
 * only changes what the next start will run. Read once, here, from the list this
 * file opens with — a copy taken at load is what that sentence means, and
 * reading `installed` at each question instead would make switching a plugin off
 * stop it in this window, which is the one thing the page promises it does not
 * do.
 *
 * A plugin has to be switched on, loadable, and holding a body to answer
 * through: the example plugin is an interface and nothing else, so it is never
 * asked anything, and the one whose manifest did not validate never started.
 */
const running = new Set(
  installed
    .filter((entry) => entry.enabled && entry.failure === null && entry.hasBody)
    .map((entry) => entry.id),
);

export function listSettings(): PluginSettingsGroup[] {
  return declarations
    .filter(([pluginId]) => running.has(pluginId))
    .map(([pluginId, fields]) => ({
      plugin: pluginId,
      fields: fields.map((field) => ({
        ...field,
        value: answers.get(`${pluginId}/${field.key}`) ?? '',
      })),
    }));
}

/**
 * The user's form, checked and kept.
 *
 * One rule of the kernel's check is repeated here, and it is repeated because
 * the refusal is drawn **beside the field it is about**: without a rule that can
 * refuse one value, no walkthrough could reach the place a reason is put, and
 * the one thing this feature is for — telling the user which box to fix — would
 * be the one thing a browser never shows. The rest of the check is the kernel's
 * and is held by its own Rust tests; nothing here looks at what a kind means.
 *
 * The refusal for a plugin that is not running is kept as well, though no
 * walkthrough can reach it: nothing hot-plugs, so the plugin a form was drawn
 * for is still running when the form is saved. It is answered here because the
 * kernel would answer it, and a copy that saved for a plugin nobody asked would
 * be a copy of a backend this application does not have.
 */
export function saveSettings(
  pluginId: string,
  values: SettingValue[],
): PluginSettingsGroup[] {
  if (!running.has(pluginId)) {
    throw {
      code: 'plugin.settings.unavailable',
      params: { plugin: pluginId },
      errorId: 'acceptance',
    } satisfies AppError;
  }
  const fields = declarations.find(([held]) => held === pluginId)?.[1] ?? [];
  const blank = fields.find(
    (field) =>
      field.required &&
      (values.find((value) => value.key === field.key)?.value ?? '').trim() ===
        '',
  );
  if (blank !== undefined) {
    throw {
      code: 'plugin.settings.required',
      params: { plugin: pluginId, field: blank.key },
      errorId: 'acceptance',
    } satisfies AppError;
  }
  // Only the declared fields are kept, which is what the kernel does with a
  // value for a field the plugin no longer asks for.
  for (const field of fields) {
    answers.set(
      `${pluginId}/${field.key}`,
      values.find((value) => value.key === field.key)?.value ?? '',
    );
  }
  return listSettings();
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
