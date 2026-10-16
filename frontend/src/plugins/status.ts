import type { PluginId } from './registry';

/**
 * What the plugin page reads, and where it comes from.
 *
 * The page's rows are not the interface's to know: which plugins are installed,
 * which of them the user switched off, and which arrived with a manifest that
 * did not validate are all facts the kernel holds before anything of the plugin
 * is loaded. They arrive over a port, and the interface only draws what it is
 * given — `#86` is what fills the port from the manifest and the enable record.
 * Until then the stand-in at the bottom of this file is what the page is given,
 * which is the honest answer: nothing is installed yet.
 */

/**
 * Why a plugin is not usable, in the kernel's error protocol rather than a
 * sentence somebody wrote: a code the interface has words for in both
 * languages, and the parameters those words ask for. A message from the plugin
 * itself would be text the interface cannot translate, cannot test, and cannot
 * hold to anything.
 */
export interface PluginFailure {
  code: string;
  params: Record<string, string>;
}

/**
 * One plugin as the kernel knows it **before** any interface is loaded.
 *
 * This is the bootstrap graph: which plugins there are, which of them the user
 * switched on, and where each one's interface lives. A plugin with no interface
 * — a body-only plugin, which is what the cover fetcher is — has no `entry` and
 * is still a row on the page.
 */
export interface PluginBootstrap {
  id: PluginId;
  /** The name the plugin gives itself in its manifest. */
  name: string;
  enabled: boolean;
  /**
   * The interface's entry, a path inside that plugin's own directory. Only
   * this file is ever reached for, which is the other half of the interface's
   * import rule (see `pluginEntryUrl`).
   */
  entry?: string;
  /** Set when the kernel would not accept the plugin at all. */
  failure?: PluginFailure;
}

/** Where the plugin page's rows come from. */
export interface PluginBootstrapPort {
  bootstrap(): Promise<readonly PluginBootstrap[]>;
}

/** What one row of the plugin page says. */
export interface PluginStatus {
  id: PluginId;
  name: string;
  state: 'enabled' | 'disabled' | 'failed';
  /** What the plugin says it is doing right now, while it is doing something. */
  activity?: string;
  /** Why it is not running, when it is not. */
  failure?: PluginFailure;
}

/**
 * The stand-in: a kernel that knows of no plugins. An empty list is not a
 * placeholder for a missing answer — it is the answer, and it is what every
 * window shows until #86 lands.
 */
export const noPlugins: PluginBootstrapPort = {
  bootstrap: async () => [],
};
