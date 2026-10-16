import * as React from 'react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { createPluginHost } from './host';
import type { BaselineModules, EntryLoader } from './host';
import { createRegistry } from './registry';
import type { DrawnKey, PluginId, PluginRegistry } from './registry';
import { noPlugins } from './status';
import type { PluginBootstrap, PluginPort, PluginStatus } from './status';

/**
 * The plugin host, as the rest of the interface sees it.
 *
 * One host for the window, built once and torn down when the window goes. What
 * is handed down is the two things anyone needs: the registration point the
 * pages draw through, and the rows the plugin page lists. Nothing else about
 * plugins is in here — a page that draws a contribution is handed it by the
 * registry and never learns which plugin it came from.
 *
 * The window is not restarted: the host is built when this provider is first
 * rendered, and a second `load()` on the same host is not a thing it supports.
 * That is a real limit rather than a decision — see the note in the report.
 */

/**
 * The mount points this interface draws, declared before anything is loaded.
 *
 * Only the ones something here actually draws. That is what makes 「this plugin
 * is registered at a place nothing shows」 a load-time error rather than a
 * silent nothing: a position nobody declared is one a registration is refused
 * on. `video.panel` and `video.fields` join this list when the video page
 * draws them, and `plugin.settings`, `scan.completed` and `video.actions` when
 * the pages that ask them do.
 */
const DRAWN_HERE = ['app.page'] as const satisfies readonly DrawnKey[];

/**
 * The kernel's own copy of a module, for a plugin that asks for one.
 *
 * Static imports, handed over only when a plugin asks, and refused for any name
 * that is not in the table: the baseline is what the kernel promises a plugin,
 * and it is the whole of what a plugin can reach. There is no import map, so
 * this is how a plugin gets React at all — and because it is the kernel's copy
 * rather than a second bundle of it, a plugin renders into the same React the
 * window does, hooks and all (docs/adr/0043-插件系统的形态.md §3).
 *
 * The namespace is imported separately from the hooks above because it is not
 * this file's to use: it is the value that is handed over.
 */
const KERNEL_BASELINE: BaselineModules = {
  react: async () => React,
};

export interface PluginHostValue {
  /** The interface's one registration point. */
  registry: PluginRegistry;
  /** One row per installed plugin, newest first as the kernel listed them. */
  statuses: readonly PluginStatus[];
  /**
   * What the plugin page may do to the plugins on disk.
   *
   * Handed down rather than reached for, so that a page is drawn against
   * whatever kernel the window was given — the real one in the application, and
   * a test's own in a test.
   */
  port: PluginPort;
  /**
   * Redraws the rows from a list a lifecycle action has just answered with.
   *
   * The page calls this instead of loading anything: a plugin the user has just
   * switched on is on from the next start, and this window goes on without it
   * (spec #82 「不做热插拔」).
   */
  refresh: (plugins: readonly PluginBootstrap[]) => void;
  /**
   * Whether the plugins are still being loaded.
   *
   * A page a plugin registered is not there until its plugin is, so a page that
   * decided "there is nothing at this address" while loading would send a user
   * away from a page that was about to be drawn — a deep link, or a window that
   * has just been opened.
   */
  loading: boolean;
}

const PluginHostContext = createContext<PluginHostValue | null>(null);

export function PluginHostProvider({
  port = noPlugins,
  baseline = KERNEL_BASELINE,
  loadEntry,
  children,
}: {
  /** Where the rows come from. The stand-in is a kernel with nothing installed. */
  port?: PluginPort;
  /** What a plugin may ask for by name. */
  baseline?: BaselineModules;
  /** How an entry is reached. Replaced in tests, where there is no disk. */
  loadEntry?: EntryLoader;
  children: ReactNode;
}) {
  // Built once for the life of the window, from props that do not change: the
  // host is what holds a plugin's registrations, so a host rebuilt on a render
  // would be one that drops them.
  const { host, registry } = useMemo(() => {
    const registry = createRegistry();
    return {
      registry,
      host: createPluginHost({
        registry,
        port,
        baseline,
        positions: DRAWN_HERE,
        loadEntry,
      }),
    };
  }, [port, baseline, loadEntry]);
  const [loading, setLoading] = useState(true);
  // Loading and unloading are the effect's, so that a render never reaches for
  // a plugin: a plugin's failure is a row on the plugin page, and the interface
  // is drawn whether or not any plugin works.
  useEffect(() => {
    let live = true;
    // `load()` resolves whatever happens, so this is when the answers are in
    // rather than a success: a plugin that failed to load is one that has been
    // answered for, and the pages it did not register are not coming.
    void host.load().then(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
      void host.dispose();
    };
  }, [host]);
  // A plugin saying what it is doing is a row changing, and a row changing is
  // this page re-rendering — no polling, and no re-render when nothing has
  // changed, because the snapshot is the same value until something does.
  const statuses = useSyncExternalStore(
    host.subscribe,
    host.statuses,
    host.statuses,
  );
  const value = useMemo(
    () => ({ registry, statuses, loading, port, refresh: host.refresh }),
    [registry, statuses, loading, port, host],
  );
  return (
    <PluginHostContext.Provider value={value}>
      {children}
    </PluginHostContext.Provider>
  );
}

/**
 * What the window's plugins are, for the navigation, the plugin page, and the
 * pages that draw a contribution.
 */
export function usePluginHost(): PluginHostValue {
  const value = useContext(PluginHostContext);
  if (!value) throw new Error('PluginHostProvider is required');
  return value;
}

/** One plugin's own entry in a video's menu: the plugin, and what to call it. */
export interface PluginAction {
  id: PluginId;
  /** The plugin's name for itself, which is what the menu item says. */
  name: string;
}

/** Nothing, handed out again on every render that has no plugins. */
const NO_ACTIONS: readonly PluginAction[] = [];

/**
 * What the plugins add to a video's own menu: one entry per plugin that has a
 * body half and is switched on.
 *
 * An action on a video is run by the plugin's body — the side that has no
 * interface of its own and can be reached no other way — so a plugin that has
 * only an interface has nothing to offer here and gets no entry. Which plugin
 * an entry belongs to is the plugin's id and not its name: two plugins may
 * call themselves the same thing, and the menu has to be able to say which one
 * the user picked.
 *
 * Unlike `usePluginHost`, this answers with nothing rather than throwing when
 * there is no provider above it. The difference is who is asking: the pages
 * that draw a plugin's own contribution are the plugin page and the navigation,
 * which are inside the provider by construction, while the menu of a video
 * belongs to a listing page that is drawn whether or not this window has any
 * plugins at all — and one that could not be drawn without a plugin host would
 * be the failure ADR 0044 §7 exists to prevent.
 */
export function usePluginActions(): readonly PluginAction[] {
  const value = useContext(PluginHostContext);
  const statuses = value?.statuses;
  return useMemo(
    () =>
      statuses === undefined
        ? NO_ACTIONS
        : statuses
            .filter((row) => row.state === 'enabled' && row.hasBody)
            .map((row) => ({ id: row.id, name: row.name })),
    [statuses],
  );
}
