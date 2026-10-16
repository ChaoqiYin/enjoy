import { pluginEntryUrl } from '../shared/api';
import { createDisposerCollector } from './disposers';
import type { Disposer } from './disposers';
import { KERNEL } from './registry';
import type {
  AnsweredContributions,
  AnsweredKey,
  DrawnContributions,
  DrawnKey,
  PluginId,
  PluginRegistry,
} from './registry';
import { noPlugins } from './status';
import type { PluginBootstrap, PluginPort, PluginStatus } from './status';

/**
 * The plugin host, interface side.
 *
 * It is the one place in the interface that knows plugins exist: it declares
 * the positions the interface draws, reaches for each enabled plugin's entry,
 * hands the factory its baseline and its registration point, and turns whatever
 * happens into a row on the plugin page. The kernel's pages know none of this —
 * they draw through the registry and never ask which plugin contributed
 * something.
 *
 * Three things about it are decisions rather than plumbing:
 *
 * - **The baseline arrives as a parameter.** A plugin interface does not import
 *   React, and there is no import map: the kernel hands over its own copy, so
 *   every plugin shares one React rather than each bundling its own
 *   (docs/adr/0043-插件系统的形态.md §3).
 * - **A plugin that will not load is a row, not an exception.** The kernel's
 *   own boot must not depend on any plugin, so `load()` resolves whatever
 *   happens and the row says what it was. This is the interface's half of
 *   「插件的失败绝不阻塞内核」.
 * - **Nothing a plugin registered outlives the host.** Every registration hands
 *   back its own cleanup, into the collector this host holds along with the
 *   registry's own teardown, so there is one thing to call and one order.
 */

/** The kernel's own copy of a module, for a plugin that asks for one. */
export interface PluginBaseline {
  /**
   * A module out of the kernel's lazy table. Asked for by name, loaded on the
   * first ask and shared from then on, and refused outright for a name the
   * kernel does not offer — a plugin gets the baseline and nothing else.
   */
  require(name: string): Promise<unknown>;
}

/** What a plugin interface is handed, besides its baseline. */
export interface PluginContext {
  readonly id: PluginId;
  /** Registers a page of the plugin's own; the navigation and the route are built from it. */
  draw<M extends DrawnKey>(
    mountPoint: M,
    contribution: DrawnContributions[M],
  ): Disposer;
  /** Registers an answer at a mount point the kernel asks. */
  answer<M extends AnsweredKey>(
    mountPoint: M,
    contribution: AnsweredContributions[M],
  ): Disposer;
  /** What this plugin is doing right now, for its row on the plugin page. */
  status(activity: string): void;
}

/**
 * What a plugin interface's entry exports: the factory the kernel calls, once,
 * when the plugin is loaded. It may be asynchronous — a plugin that wants a
 * baseline module asks for it here, and that is a promise.
 */
export type PluginFactory = (
  baseline: PluginBaseline,
  context: PluginContext,
) => void | Promise<void>;

/** The shape of a plugin interface's entry module. */
export interface PluginInterfaceModule {
  default?: PluginFactory;
}

/**
 * How the host reaches an entry: the path the kernel handed over, and the
 * module it holds. Replaced in tests, where there is no disk — and the path is
 * handed over raw, so that a test's loader never has to stand in for the
 * platform as well.
 */
export type EntryLoader = (entry: string) => Promise<PluginInterfaceModule>;

/**
 * The lazy module table the kernel injects: a name, and how to load it. Only
 * the baseline is in it — a plugin can reach nothing else through `require`.
 */
export type BaselineModules = Readonly<Record<string, () => Promise<unknown>>>;

/**
 * Where the order the kernel answered with is kept, for the registration point
 * to read.
 *
 * A box rather than a value, and that is the direction the two are built in: the
 * registry is handed to the host, so the host cannot hand the registry anything,
 * and a position is read long after the list arrived — when a page draws, which
 * is any time. The host writes each answer's order into it; the registry reads it
 * whenever a position is read. `PluginHostProvider` is where the one box is made
 * and given to both.
 */
export interface PluginOrder {
  /** The plugins, in the order the kernel last answered with. */
  ids: readonly PluginId[];
}

export interface PluginHostOptions {
  registry: PluginRegistry;
  /** Where the rows come from. The stand-in is a kernel with nothing installed. */
  port?: PluginPort;
  baseline?: BaselineModules;
  /**
   * The positions this interface draws, declared before any plugin is loaded.
   * Only the ones something here actually draws belong in it: a position nobody
   * declared is a registration that fails loudly, which is what makes
   * 「this plugin is registered at a place nothing shows」 a load-time error
   * rather than a silent nothing.
   */
  positions: readonly DrawnKey[];
  /**
   * Where the order each answer has is put, for the registration point to read.
   *
   * Left out, nothing is written down and every position keeps the order its
   * plugins registered in — which is what a host built without a registry to
   * order has to do. The provider always gives one: the order is part of what a
   * row is, not a detail of how the page draws it.
   */
  order?: PluginOrder;
  loadEntry?: EntryLoader;
}

export interface PluginHost {
  /** Declares the positions, then loads every enabled interface. Resolves whatever happens. */
  load(): Promise<void>;
  /**
   * Redraws the rows from a list the kernel has just answered with, without
   * loading anything.
   *
   * This is what a lifecycle action answers with. Installing, switching and
   * uninstalling take effect on the next start (spec #82 「不做热插拔」), so
   * what changes here is what the page says about the plugins — not what this
   * window is running. Loading the entry of a plugin the user has just switched
   * on would be the hot-plug the spec does not have.
   */
  refresh(plugins: readonly PluginBootstrap[]): void;
  /** One row per installed plugin. The same value until something changes. */
  statuses(): readonly PluginStatus[];
  /** Told when a row changes — a plugin saying what it is doing, or failing. */
  subscribe(listener: () => void): Disposer;
  /** Takes off what the plugins registered, and the positions with it. */
  dispose(): Promise<void>;
}

/**
 * The one dynamic `import()` the interface is allowed to make.
 *
 * A plugin is a directory of its own outside this build, so its entry is not a
 * module this bundle knows about: the kernel hands over the path of a file
 * inside that plugin's directory, and `pluginEntryUrl` is what turns it into
 * something the webview can fetch — the same conversion thumbnails go through,
 * in the one file that reaches the backend (`shared/api.ts`).
 *
 * It is the only one, and it is here by name: `scripts/check-source.mjs` holds
 * the ban on reaching for a module at run time, with one exception — this
 * module, and only of that function. So the exception is a name rather than a
 * hole, and the file it names is the file a reviewer reads.
 */
async function importPluginInterface(
  entry: string,
): Promise<PluginInterfaceModule> {
  return (await import(
    /* @vite-ignore */ pluginEntryUrl(entry)
  )) as PluginInterfaceModule;
}

export function createPluginHost({
  registry,
  port = noPlugins,
  baseline = {},
  positions,
  order,
  loadEntry = importPluginInterface,
}: PluginHostOptions): PluginHost {
  const collector = createDisposerCollector();
  // One collector for the whole thing: the registry's teardown goes in beside
  // everything else the host owns, so there is one call and one order.
  collector.add(() => registry.dispose());
  // What this interface draws is claimed here, when the host is built, and not
  // when the first plugin is loaded: the navigation reads a position on its
  // very first render, and a position that appeared later would be a page that
  // is missing from the navigation until something else happened.
  for (const mountPoint of positions) registry.declare(mountPoint, KERNEL);

  const statuses = new Map<PluginId, PluginStatus>();
  const listeners = new Set<() => void>();
  let snapshot: readonly PluginStatus[] = [];

  function changed() {
    snapshot = [...statuses.values()];
    for (const listener of listeners) listener();
  }

  /**
   * Writes a row. What the plugin has already said it is doing survives a row
   * being rewritten — a plugin that reports progress and then fails is a row
   * that says both.
   */
  function put(row: PluginStatus) {
    statuses.set(row.id, {
      ...row,
      activity: row.activity ?? statuses.get(row.id)?.activity,
    });
    changed();
  }

  function failed(entry: PluginBootstrap, code: string): PluginStatus {
    return {
      id: entry.id,
      name: entry.name,
      state: 'failed',
      hasBody: entry.hasBody,
      failure: { code, params: { plugin: entry.name } },
    };
  }

  /**
   * One plugin's row, as a list the kernel answered with has it.
   *
   * `activity` is carried in rather than read off the map, so that what a plugin
   * said it is doing survives its row being rewritten: a plugin that reports
   * progress and then fails is a row that says both.
   */
  function rowFor(entry: PluginBootstrap, activity?: string): PluginStatus {
    const row = {
      id: entry.id,
      name: entry.name,
      hasBody: entry.hasBody,
      activity,
    };
    // A manifest the kernel would not accept is the one failure a row can carry
    // before anything of the plugin is reached for; the rest are the loading
    // failures `start` writes down.
    if (entry.failure !== null) {
      return { ...row, state: 'failed', failure: entry.failure };
    }
    return { ...row, state: entry.enabled ? 'enabled' : 'disabled' };
  }

  // Asked for by name and loaded once: every plugin that asks for React gets
  // the kernel's React, not a second copy of it.
  const pending = new Map<string, Promise<unknown>>();
  function requireModule(name: string): Promise<unknown> {
    const load = baseline[name];
    if (load === undefined) {
      return Promise.reject(
        new Error(`the kernel does not offer a baseline module named ${name}`),
      );
    }
    const already = pending.get(name);
    if (already !== undefined) return already;
    const loading = load();
    pending.set(name, loading);
    return loading;
  }

  function contextFor(id: PluginId): PluginContext {
    return {
      id,
      draw(mountPoint, contribution) {
        return registry.draw(mountPoint, contribution, id);
      },
      answer(mountPoint, contribution) {
        return registry.answer(mountPoint, contribution, id);
      },
      status(activity) {
        const row = statuses.get(id);
        if (row !== undefined) put({ ...row, activity });
      },
    };
  }

  async function start(
    entry: PluginBootstrap & { entry: string },
  ): Promise<void> {
    put({
      id: entry.id,
      name: entry.name,
      state: 'enabled',
      hasBody: entry.hasBody,
    });
    const context = contextFor(entry.id);
    let module: PluginInterfaceModule;
    try {
      module = await loadEntry(entry.entry);
    } catch {
      put(failed(entry, 'plugin.interface.unreachable'));
      return;
    }
    const factory = module.default;
    if (typeof factory !== 'function') {
      put(failed(entry, 'plugin.interface.no_factory'));
      return;
    }
    try {
      await factory({ require: requireModule }, context);
    } catch {
      // The message the factory threw is not carried into the row: it is the
      // plugin's own words, in a language the interface cannot translate, and
      // it belongs in the diagnostic log with the排查编号 rather than on the
      // page. What the row says is which of the three things went wrong.
      put(failed(entry, 'plugin.interface.start_failed'));
    }
  }

  /**
   * The rows a list of plugins says there should be, without loading anything.
   *
   * A plugin that is gone loses its row, which is the one thing a lifecycle
   * action can do that no plugin of its own can: uninstalling it. Everything
   * else is what the kernel answered.
   *
   * The rows come out in the order the answer has them, and that is not the same
   * thing as rewriting them where they stand: a `Map` keeps the place of a key it
   * already holds, so a plugin the user has just moved up would go on being drawn
   * below the ones it has passed. The order *is* the answer — it is what decides
   * who is asked first at a mount point several plugins contribute to (ADR 0045
   * §3) — so the page draws it rather than the order the rows happened to be made
   * in. A plugin with no interface — a body-only one — is on, and has nothing for
   * this side to load; one that has an interface is written down as on here and
   * loaded below, so that a window which never loads it (a lifecycle action,
   * which is not a load) still says the right thing.
   */
  function refresh(plugins: readonly PluginBootstrap[]): void {
    const rows = new Map<PluginId, PluginStatus>();
    for (const entry of plugins) {
      rows.set(entry.id, rowFor(entry, statuses.get(entry.id)?.activity));
    }
    statuses.clear();
    for (const [id, row] of rows) statuses.set(id, row);
    // Written here rather than where the plugins are loaded, because this is
    // every answer there is: the first one, and each one a lifecycle action
    // answers with. A position a plugin reads while it is loading reads the
    // order that came with the list it was loaded from.
    if (order !== undefined) order.ids = plugins.map((entry) => entry.id);
    changed();
  }

  async function load(): Promise<void> {
    const plugins = await port.bootstrap();
    refresh(plugins);
    for (const entry of plugins) {
      if (entry.failure === null && entry.enabled && entry.entry !== null) {
        await start({ ...entry, entry: entry.entry });
      }
    }
  }

  return {
    load,
    refresh,
    statuses: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => collector.dispose(),
  };
}
