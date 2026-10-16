import { expect, it, vi } from 'vitest';
import { createPluginHost } from './host';
import type { PluginContext, PluginInterfaceModule } from './host';
import { createRegistry } from './registry';
import type { PluginBootstrap, PluginPort } from './status';
import { pluginPort } from '../test/doubles';

// The host is the seam between the kernel and a plugin interface: it declares
// what the interface draws, reaches for each plugin's entry, hands the factory
// its baseline, and turns whatever happens into a row on the plugin page. What
// it is held to is that a plugin's failure is a row and never an exception, and
// that nothing a plugin registered outlives the host.

const plugin = (overrides: Partial<PluginBootstrap> = {}): PluginBootstrap => ({
  id: 'a-plugin',
  name: 'A plugin',
  author: 'someone',
  capabilities: [],
  enabled: true,
  entry: 'a-plugin/interface.js',
  hasBody: false,
  failure: null,
  ...overrides,
});

function portOf(...plugins: PluginBootstrap[]): PluginPort {
  return pluginPort(plugins);
}

it('declares the positions the interface draws before it loads anything', async () => {
  const registry = createRegistry();
  const host = createPluginHost({
    registry,
    port: portOf(plugin()),
    baseline: {},
    positions: ['app.page'],
    loadEntry: async () => ({
      default: (_baseline, context: PluginContext) => {
        // A registration the interface would refuse if nothing had declared
        // the position yet: the declaration is the kernel's, and it is made
        // before the first plugin is reached for.
        context.draw('app.page', {
          key: 'a-page',
          label: 'A page',
          draw: () => null,
        });
      },
    }),
  });
  // Before `load()` is even called: the navigation reads a position on its
  // first render, so what the interface draws is declared when the host is
  // built rather than when the first plugin arrives.
  expect(registry.drawsAt('app.page', 'kernel')).toEqual([]);
  await host.load();
  expect(registry.drawsAt('app.page', 'kernel')).toHaveLength(1);
  expect(host.statuses()[0].state).toBe('enabled');
});

it('loads a baseline module only when the plugin asks for it', async () => {
  const registry = createRegistry();
  const react = vi.fn(async () => ({ name: 'react' }));
  let handed: unknown;
  const host = createPluginHost({
    registry,
    port: portOf(plugin()),
    baseline: { react },
    positions: [],
    loadEntry: async () => ({
      default: async (baseline) => {
        handed = await baseline.require('react');
      },
    }),
  });
  await host.load();
  expect(handed).toEqual({ name: 'react' });
  expect(react).toHaveBeenCalledTimes(1);
});

it('hands every plugin the same instance of a baseline module', async () => {
  // The reason the baseline is a parameter rather than an import: one React for
  // the whole window, not one per plugin.
  const registry = createRegistry();
  const react = vi.fn(async () => ({ name: 'react' }));
  const handed: unknown[] = [];
  const host = createPluginHost({
    registry,
    port: portOf(plugin({ id: 'first' }), plugin({ id: 'second' })),
    baseline: { react },
    positions: [],
    loadEntry: async () => ({
      default: async (baseline) => {
        handed.push(await baseline.require('react'));
      },
    }),
  });
  await host.load();
  expect(react).toHaveBeenCalledTimes(1);
  expect(handed[0]).toBe(handed[1]);
});

it('never loads a baseline module nobody asked for', async () => {
  const registry = createRegistry();
  const react = vi.fn(async () => ({ name: 'react' }));
  const host = createPluginHost({
    registry,
    port: portOf(plugin()),
    baseline: { react },
    positions: [],
    loadEntry: async () => ({ default: () => {} }),
  });
  await host.load();
  expect(react).not.toHaveBeenCalled();
  expect(host.statuses()[0].state).toBe('enabled');
});

it('refuses a baseline name the kernel does not offer, as that plugin failing', async () => {
  const registry = createRegistry();
  const host = createPluginHost({
    registry,
    port: portOf(plugin()),
    baseline: { react: async () => ({}) },
    positions: [],
    loadEntry: async () => ({
      default: async (baseline) => {
        await baseline.require('lodash');
      },
    }),
  });
  await host.load();
  expect(host.statuses()[0]).toMatchObject({
    state: 'failed',
    failure: { code: 'plugin.interface.start_failed' },
  });
});

it('names what went wrong when an entry cannot be reached, and keeps going', async () => {
  const registry = createRegistry();
  const host = createPluginHost({
    registry,
    port: portOf(
      plugin({
        id: 'unreachable',
        name: 'Unreachable',
        entry: 'unreachable/interface.js',
      }),
      plugin({
        id: 'no-factory',
        name: 'No factory',
        entry: 'no-factory/interface.js',
      }),
      plugin({ id: 'throws', name: 'Throws', entry: 'throws/interface.js' }),
      plugin({ id: 'fine', name: 'Fine', entry: 'fine/interface.js' }),
    ),
    baseline: {},
    positions: [],
    loadEntry: async (entry: string): Promise<PluginInterfaceModule> => {
      if (entry.startsWith('unreachable')) throw new Error('no such file');
      if (entry.startsWith('no-factory')) return {};
      if (entry.startsWith('throws')) {
        return {
          default: () => {
            throw new Error('the factory broke');
          },
        };
      }
      return { default: () => {} };
    },
  });
  // Resolves rather than rejects: a plugin that will not load is a row on the
  // page, not a failure of the kernel's own boot.
  await host.load();
  expect(
    host.statuses().map(({ id, state, failure }) => [id, state, failure?.code]),
  ).toEqual([
    ['unreachable', 'failed', 'plugin.interface.unreachable'],
    ['no-factory', 'failed', 'plugin.interface.no_factory'],
    ['throws', 'failed', 'plugin.interface.start_failed'],
    ['fine', 'enabled', undefined],
  ]);
});

it('lists a plugin the user switched off without reaching for its entry', async () => {
  const registry = createRegistry();
  const loadEntry = vi.fn(async () => ({ default: () => {} }));
  const host = createPluginHost({
    registry,
    port: portOf(plugin({ enabled: false })),
    baseline: {},
    positions: [],
    loadEntry,
  });
  await host.load();
  expect(loadEntry).not.toHaveBeenCalled();
  expect(host.statuses()[0]).toMatchObject({ state: 'disabled' });
});

it('carries a manifest the kernel refused through to the row', async () => {
  const registry = createRegistry();
  const loadEntry = vi.fn(async () => ({ default: () => {} }));
  const host = createPluginHost({
    registry,
    port: portOf(
      plugin({
        failure: {
          code: 'plugin.manifest.invalid',
          params: { plugin: 'A plugin' },
        },
      }),
    ),
    baseline: {},
    positions: [],
    loadEntry,
  });
  await host.load();
  expect(loadEntry).not.toHaveBeenCalled();
  expect(host.statuses()[0]).toMatchObject({
    state: 'failed',
    failure: { code: 'plugin.manifest.invalid' },
  });
});

it('shows what a plugin says it is doing, and tells whoever is watching', async () => {
  const registry = createRegistry();
  let context: PluginContext | undefined;
  const host = createPluginHost({
    registry,
    port: portOf(plugin()),
    baseline: {},
    positions: [],
    loadEntry: async () => ({
      default: (_baseline, pluginContext) => {
        context = pluginContext;
      },
    }),
  });
  await host.load();
  expect(host.statuses()[0].activity).toBeUndefined();
  let heard = 0;
  const stop = host.subscribe(() => {
    heard += 1;
  });
  context!.status('fetching a cover');
  expect(host.statuses()[0].activity).toBe('fetching a cover');
  expect(heard).toBe(1);
  stop();
  context!.status('still fetching');
  expect(heard).toBe(1);
});

it('hands the same value back until something changes', async () => {
  // `useSyncExternalStore` re-renders on identity, so a snapshot rebuilt on
  // every read would be a render loop rather than a page.
  const registry = createRegistry();
  const host = createPluginHost({
    registry,
    port: portOf(plugin()),
    baseline: {},
    positions: [],
    loadEntry: async () => ({ default: () => {} }),
  });
  await host.load();
  expect(host.statuses()).toBe(host.statuses());
});

it('takes off what the plugins registered when the host goes', async () => {
  const registry = createRegistry();
  const host = createPluginHost({
    registry,
    port: portOf(plugin()),
    baseline: {},
    positions: ['app.page'],
    loadEntry: async () => ({
      default: (_baseline, context: PluginContext) => {
        context.draw('app.page', {
          key: 'a-page',
          label: 'A page',
          draw: () => null,
        });
      },
    }),
  });
  await host.load();
  expect(registry.drawsAt('app.page', 'kernel')).toHaveLength(1);
  await host.dispose();
  expect(() => registry.drawsAt('app.page', 'kernel')).toThrow();
});

it('hands the entry path to the loader as the kernel gave it', async () => {
  // The conversion to a URL the webview can fetch is `pluginEntryUrl`'s, in the
  // file that reaches the backend; what the host passes on is the path itself,
  // so a test's loader never has to stand in for the platform as well.
  const loadEntry = vi.fn(async () => ({ default: () => {} }));
  const host = createPluginHost({
    registry: createRegistry(),
    port: portOf(plugin()),
    baseline: {},
    positions: [],
    loadEntry,
  });
  await host.load();
  expect(loadEntry).toHaveBeenCalledWith('a-plugin/interface.js');
});

it('redraws the rows from a list without loading anything', async () => {
  // What a lifecycle action answers with. Switching a plugin on takes effect on
  // the next start (spec #82 「不做热插拔」), so the row changes and the entry is
  // not reached for — loading it here would be the hot-plug the spec does not
  // have.
  const registry = createRegistry();
  const loadEntry = vi.fn(async () => ({ default: () => {} }));
  const host = createPluginHost({
    registry,
    port: portOf(),
    baseline: {},
    positions: [],
    loadEntry,
  });
  await host.load();
  expect(host.statuses()).toEqual([]);

  host.refresh([
    plugin({ id: 'cover', name: 'Cover Fetcher' }),
    plugin({ id: 'off', name: 'Switched off', enabled: false }),
  ]);
  expect(host.statuses().map((row) => `${row.id}:${row.state}`)).toEqual([
    'cover:enabled',
    'off:disabled',
  ]);
  expect(loadEntry).not.toHaveBeenCalled();
});

it('drops the row of a plugin that is gone, and keeps what a plugin said', async () => {
  const registry = createRegistry();
  let said: ((activity: string) => void) | undefined;
  const host = createPluginHost({
    registry,
    port: portOf(plugin({ id: 'cover', name: 'Cover Fetcher' })),
    baseline: {},
    positions: [],
    loadEntry: async () => ({
      default: (_baseline, context) => {
        said = context.status;
      },
    }),
  });
  await host.load();
  said!('fetching a cover');
  expect(host.statuses()[0].activity).toBe('fetching a cover');

  // Uninstalling is the one thing a lifecycle action does that no plugin of its
  // own can: the row goes. Everything else is the kernel's answer, and a row
  // that is still there keeps saying what its plugin is doing.
  host.refresh([plugin({ id: 'cover', name: 'Cover Fetcher' })]);
  expect(host.statuses()[0].activity).toBe('fetching a cover');
  host.refresh([]);
  expect(host.statuses()).toEqual([]);
});
