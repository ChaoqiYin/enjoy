import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { KERNEL } from './registry';
import {
  PluginHostProvider,
  usePluginActions,
  usePluginHost,
} from './PluginHostProvider';
import type { PluginContext } from './host';
import type { PluginBootstrap, PluginFailure, PluginPort } from './status';
import { pluginPort } from '../test/doubles';

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
    entry?: string | null;
    hasBody?: boolean;
    failure?: PluginFailure | null;
  }[]
): PluginPort {
  return pluginPort(bootstraps(...plugins));
}

/** The same list, as the kernel answers with it: what a lifecycle action hands
 * back to `refresh` rather than a port that answers it. */
function bootstraps(
  ...plugins: {
    id: string;
    name: string;
    enabled: boolean;
    entry?: string | null;
    hasBody?: boolean;
    failure?: PluginFailure | null;
  }[]
): PluginBootstrap[] {
  return plugins.map((entry) => ({
    author: 'someone',
    capabilities: [],
    entry: null,
    hasBody: false,
    failure: null,
    ...entry,
  }));
}

/** What a video's own menu reads: the plugins that can act on one. */
let actions: readonly { id: string; name: string }[] = [];

function Actions() {
  actions = usePluginActions();
  return (
    <p data-testid="actions">
      {actions.map((plugin) => `${plugin.id}:${plugin.name}`).join('|')}
    </p>
  );
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

it('reads every position in the order the user arranged the plugins in', async () => {
  // The order is what decides who is asked first where several plugins
  // contribute to one mount point (ADR 0045 §3), and the kernel's answer is
  // that order — so the registration point reads the answer rather than the
  // order the plugins happened to be loaded in. The two agree when the window
  // starts and part company the moment the user moves one, which is the case
  // this is about: the rows are redrawn from the answer while this window goes
  // on running what it loaded (spec #82, 「不做热插拔」).
  render(
    <PluginHostProvider
      port={portOf(
        { id: 'first', name: 'First', enabled: true, entry: 'first/entry.js' },
        {
          id: 'second',
          name: 'Second',
          enabled: true,
          entry: 'second/entry.js',
        },
      )}
      loadEntry={async (entry) => ({
        default: (_baseline, context: PluginContext) => {
          const id = entry.split('/')[0];
          context.draw('app.page', { key: id, label: id, draw: () => null });
        },
      })}
    >
      <Probe />
    </PluginHostProvider>,
  );
  const drawn = () =>
    held.registry.drawsAt('app.page', KERNEL).map(({ owner }) => owner);
  await waitFor(() => expect(drawn()).toEqual(['first', 'second']));

  // The user moves the second one up, and the page redraws from what the kernel
  // answered. Nothing is loaded a second time: what changed is the order.
  act(() => {
    held.refresh(
      bootstraps(
        {
          id: 'second',
          name: 'Second',
          enabled: true,
          entry: 'second/entry.js',
        },
        { id: 'first', name: 'First', enabled: true, entry: 'first/entry.js' },
      ),
    );
  });
  expect(drawn()).toEqual(['second', 'first']);
});

it('offers a video’s menu one entry per plugin that has a body', async () => {
  render(
    <PluginHostProvider
      port={portOf(
        {
          id: 'cover-fetcher',
          name: 'Cover Fetcher',
          enabled: true,
          hasBody: true,
        },
        // Only an interface: there is no body to run an action, so this plugin
        // has nothing to offer a video's menu.
        {
          id: 'a-plugin',
          name: 'A plugin',
          enabled: true,
          entry: 'a/entry.js',
        },
        // Switched off, and a body would not be run either way.
        { id: 'off', name: 'Off', enabled: false, hasBody: true },
        // A manifest the kernel would not take: it is a row with a reason, not
        // a plugin, and nothing of it runs.
        {
          id: 'broken',
          name: 'Broken',
          enabled: true,
          hasBody: true,
          failure: { code: 'plugin.manifest.invalid', params: {} },
        },
      )}
      loadEntry={async () => ({ default: () => {} })}
    >
      <Actions />
    </PluginHostProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId('actions').textContent).toBe(
      'cover-fetcher:Cover Fetcher',
    ),
  );
});

it('answers a menu with no plugins at all when nothing is above it', () => {
  // A listing page is drawn whether or not this window has a plugin host: the
  // menu it draws is the one it always had.
  render(<Actions />);
  expect(actions).toEqual([]);
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
