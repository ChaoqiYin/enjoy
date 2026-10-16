import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { KERNEL } from './registry';
import { PluginHostProvider, usePluginHost } from './PluginHostProvider';
import type { PluginContext } from './host';
import type { PluginBootstrapPort } from './status';

// The provider is where the interface's registration point meets React: the one
// host for the window, the rows the plugin page reads, and the teardown when the
// window goes. What it is held to is that a page can read a position on its very
// first render, that a plugin's own words reach the page while it runs, and that
// nothing a plugin registered outlives the provider.

afterEach(cleanup);

/** The plugin page and the navigation, in one component: everything either of
 * them needs from the provider, read the way they read it. */
let held: ReturnType<typeof usePluginHost>;

function Probe() {
  const host = usePluginHost();
  held = host;
  return (
    <p data-testid="rows">
      {host.statuses
        .map((row) => `${row.id}:${row.state}:${row.activity ?? ''}`)
        .join('|')}
    </p>
  );
}

function portOf(
  ...plugins: {
    id: string;
    name: string;
    enabled: boolean;
    entry?: string;
  }[]
): PluginBootstrapPort {
  return { bootstrap: async () => plugins };
}

it('gives the window a position to read before any plugin has loaded', () => {
  // The navigation reads `app.page` while it is being rendered for the first
  // time, so the positions have to be declared by then — a position declared
  // when the first plugin arrives would be a page missing from the navigation
  // until something else happened.
  render(
    <PluginHostProvider>
      <Probe />
    </PluginHostProvider>,
  );
  expect(held.registry.drawsAt('app.page', KERNEL)).toEqual([]);
});

it('says the plugins are still being loaded until every answer is in', async () => {
  // A page a plugin registered is not there until its plugin is, and a window
  // that has just been opened reads the address it was left on before anything
  // has loaded: an answer given then would be given too early.
  render(
    <PluginHostProvider
      port={portOf({ id: 'a-plugin', name: 'A plugin', enabled: true })}
    >
      <Probe />
    </PluginHostProvider>,
  );
  expect(held.loading).toBe(true);
  await waitFor(() => expect(held.loading).toBe(false));
});

it('lists a row per installed plugin, once the kernel has answered', async () => {
  render(
    <PluginHostProvider
      port={portOf(
        {
          id: 'a-plugin',
          name: 'A plugin',
          enabled: true,
          entry: 'a/interface.js',
        },
        { id: 'off', name: 'Off', enabled: false },
      )}
      loadEntry={async () => ({ default: () => {} })}
    >
      <Probe />
    </PluginHostProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('rows').textContent).toBe(
      'a-plugin:enabled:|off:disabled:',
    );
  });
});

it('shows what a plugin says it is doing, as it says it', async () => {
  let context: PluginContext | undefined;
  render(
    <PluginHostProvider
      port={portOf({
        id: 'a-plugin',
        name: 'A plugin',
        enabled: true,
        entry: 'a/interface.js',
      })}
      loadEntry={async () => ({
        default: (_baseline, pluginContext: PluginContext) => {
          context = pluginContext;
        },
      })}
    >
      <Probe />
    </PluginHostProvider>,
  );
  await waitFor(() => expect(context).toBeDefined());
  act(() => context!.status('fetching a cover'));
  expect(screen.getByTestId('rows').textContent).toBe(
    'a-plugin:enabled:fetching a cover',
  );
});

it('draws a page a plugin registered, where the navigation put it', async () => {
  render(
    <PluginHostProvider
      port={portOf({
        id: 'a-plugin',
        name: 'A plugin',
        enabled: true,
        entry: 'a/interface.js',
      })}
      loadEntry={async () => ({
        default: (_baseline, context: PluginContext) => {
          context.draw('app.page', {
            key: 'covers',
            label: 'Covers',
            draw: () => null,
          });
        },
      })}
    >
      <Probe />
    </PluginHostProvider>,
  );
  await waitFor(() => {
    expect(
      held.registry
        .drawsAt('app.page', KERNEL)
        .map(({ owner, contribution }) => [owner, contribution.key]),
    ).toEqual([['a-plugin', 'covers']]);
  });
});

it('takes what the plugins registered off when the window goes', async () => {
  const { unmount } = render(
    <PluginHostProvider
      port={portOf({
        id: 'a-plugin',
        name: 'A plugin',
        enabled: true,
        entry: 'a/interface.js',
      })}
      loadEntry={async () => ({
        default: (_baseline, context: PluginContext) => {
          context.draw('app.page', {
            key: 'covers',
            label: 'Covers',
            draw: () => null,
          });
        },
      })}
    >
      <Probe />
    </PluginHostProvider>,
  );
  await waitFor(() =>
    expect(held.registry.drawsAt('app.page', KERNEL)).toHaveLength(1),
  );
  const registry = held.registry;
  unmount();
  // The position goes with it: the declaration was the host's, and nothing a
  // plugin put on it outlives the provider that loaded it.
  await waitFor(() =>
    expect(() => registry.drawsAt('app.page', KERNEL)).toThrow(),
  );
});
