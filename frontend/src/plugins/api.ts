import { pluginApi } from '../shared/api';
import type { PluginPort } from './status';

/**
 * The plugin port, over the kernel's plugin commands.
 *
 * It exists so that the plugin modules name one thing — a port — rather than
 * seven commands, and so that a test can hand the page a kernel of its own
 * without a backend behind it. The commands themselves are named in
 * `shared/api.ts`, which is the one file the backend is reached from
 * (`check-commands.mjs`); nothing here reaches for Tauri.
 *
 * The kernel answers each of these with the list as it now stands, so the port
 * hands that straight on: the caller replaces its rows with the answer rather
 * than working out what changed.
 */
export const pluginPort: PluginPort = {
  bootstrap: () => pluginApi.list(),
  setEnabled: (id, enabled) => pluginApi.setEnabled(id, enabled),
  setOrder: (ids) => pluginApi.setOrder([...ids]),
  preview: (source) => pluginApi.preview(source),
  install: (source) => pluginApi.install(source),
  uninstall: (id, deleteContent) => pluginApi.uninstall(id, deleteContent),
  contentRows: (id) => pluginApi.contentRows(id),
  safeMode: () => pluginApi.safeMode(),
};
