import type {
  PluginBootstrap,
  PluginFailure,
  PluginInstallPreview,
  PluginSettingField,
  PluginSettingsGroup,
} from '../shared/api';
import type { SettingValue } from './mountPoints';
import type { PluginId } from './registry';

/**
 * What the plugin page reads, and where it comes from.
 *
 * The page's rows are not the interface's to know: which plugins are installed,
 * which of them the user switched off, and which arrived with a manifest that
 * did not validate are all facts the kernel holds before anything of the plugin
 * is loaded. They arrive over a port, and the interface only draws what it is
 * given.
 *
 * The three shapes they arrive in are declared where every other shape that
 * crosses the seam is declared, and handed on from here so that a reader of the
 * plugin modules finds them under the name they use.
 */
export type {
  PluginBootstrap,
  PluginFailure,
  PluginInstallPreview,
  PluginSettingField,
  PluginSettingsGroup,
};
export type { SettingValue } from './mountPoints';

/**
 * What the plugin page may do to the plugins on disk.
 *
 * One port rather than two, because reading the list and changing it are the
 * same conversation: every method that changes something answers with the list
 * as it now stands, and a second port would only be a second way to say which
 * kernel is being talked to.
 */
export interface PluginPort {
  /** Every installed plugin, in the order the user arranged them. */
  bootstrap(): Promise<readonly PluginBootstrap[]>;
  setEnabled(
    id: PluginId,
    enabled: boolean,
  ): Promise<readonly PluginBootstrap[]>;
  /**
   * Writes down the order the user arranged the plugins in.
   *
   * The whole order rather than a move: which plugin a position belongs to is
   * the kernel's to check — an id it never handed out is refused — and a page
   * that sent "swap these two" would be deciding a rule that is not its own.
   * Reading the current order is `bootstrap`, which already answers it.
   */
  setOrder(ids: readonly PluginId[]): Promise<readonly PluginBootstrap[]>;
  /** What installing this source would do, without doing any of it. */
  preview(source: string): Promise<PluginInstallPreview>;
  install(source: string): Promise<readonly PluginBootstrap[]>;
  uninstall(
    id: PluginId,
    deleteContent: boolean,
  ): Promise<readonly PluginBootstrap[]>;
  /** How many rows of the library this plugin wrote. */
  contentRows(id: PluginId): Promise<number>;
  /** Puts the enable record aside: nothing is switched on, everything stays. */
  safeMode(): Promise<readonly PluginBootstrap[]>;
  /**
   * What the plugins need the user to fill in, with what the user has.
   *
   * Only the plugins this window is asking appear, which is the running window's
   * rotation rather than the disk: a plugin switched on since the window opened
   * has not been asked anything and has no form until the next start.
   */
  settings(spaceId: number): Promise<readonly PluginSettingsGroup[]>;
  /**
   * Checks and saves one plugin's form, answering with every group as it now
   * stands — the same shape `settings` answers with, so the page redraws from
   * the answer instead of working out what changed.
   */
  saveSettings(
    spaceId: number,
    id: PluginId,
    values: readonly SettingValue[],
  ): Promise<readonly PluginSettingsGroup[]>;
}

/** What one row of the plugin page says. */
export interface PluginStatus {
  id: PluginId;
  name: string;
  state: 'enabled' | 'disabled' | 'failed';
  /**
   * Whether the plugin declares a body half.
   *
   * Carried here rather than read off the manifest again because it is the
   * answer to a question the interface asks about a video: an action on a
   * video's own menu is run by the body half, so a plugin that has only an
   * interface has nothing to offer one and gets no entry.
   */
  hasBody: boolean;
  /** What the plugin says it is doing right now, while it is doing something. */
  activity?: string;
  /** Why it is not running, when it is not. */
  failure?: PluginFailure;
}

/**
 * The stand-in: a kernel that knows of no plugins.
 *
 * An empty list is not a placeholder for a missing answer — it is the answer,
 * and it is what a window with no backend behind it shows. What it cannot do is
 * change anything: the lifecycle methods say so rather than resolving, so that a
 * control pressed against this stand-in reports a failure instead of appearing
 * to have worked.
 */
export const noPlugins: PluginPort = {
  bootstrap: async () => [],
  setEnabled: () => nothingToChange(),
  setOrder: () => nothingToChange(),
  preview: () => nothingToChange(),
  install: () => nothingToChange(),
  uninstall: () => nothingToChange(),
  contentRows: () => nothingToChange(),
  safeMode: () => nothingToChange(),
  // Reading answers with nothing, which is the truth about a window with no
  // backend: there are no plugins to need anything filled in. Saving says so
  // rather than resolving, like the four lifecycle methods above.
  settings: async () => [],
  saveSettings: () => nothingToChange(),
};

function nothingToChange(): Promise<never> {
  return Promise.reject(new Error('no plugin kernel is behind this window'));
}
