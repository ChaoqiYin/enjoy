// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import * as doubles from '../test/doubles';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PluginsPage } from './PluginsPage';
import { PluginHostProvider } from '../plugins/PluginHostProvider';
import type { EntryLoader } from '../plugins/host';
import type { PluginBootstrap, PluginBootstrapPort } from '../plugins/status';
import english from '../../../shared/locales/en/common.json';
import errors from '../../../shared/locales/en/errors.json';

// The page's frame is the library's — it carries the notices and the scan the
// whole window shares — and neither is what this file is about.
vi.mock('../features/library/useScan', () => ({
  useScan: () => doubles.scan(),
}));
vi.mock('../features/library/useNotices', () => ({
  useNotices: () => doubles.notices(),
}));

// What the plugin page is held to is the whole of what it has to do: one row
// per installed plugin, saying which of the three states it is in, why it is
// not running when it is not, and what it says it is doing — and, with nothing
// installed, words rather than a blank page.

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english, errors } },
  });
});

afterEach(cleanup);

const plugin = (
  overrides: Partial<PluginBootstrap> & { id: string; name: string },
): PluginBootstrap => ({ enabled: true, ...overrides });

function portOf(...plugins: PluginBootstrap[]): PluginBootstrapPort {
  return { bootstrap: async () => plugins };
}

function page(port: PluginBootstrapPort, loadEntry?: EntryLoader) {
  return render(
    <I18nextProvider i18n={i18n}>
      <PluginHostProvider port={port} loadEntry={loadEntry}>
        <PluginsPage />
      </PluginHostProvider>
    </I18nextProvider>,
  );
}

/** What the page says about one plugin, as one line. */
function rowText(name: string): string {
  return screen.getByText(name).closest('li')?.textContent ?? '';
}

/** Held to it until it says so: a plugin's row is written more than once — it
 * is on the moment it is reached for, and the rest arrives when it does. */
async function row(name: string, expected: string) {
  await waitFor(() => expect(rowText(name)).toBe(expected));
}

it('says there is nothing installed rather than drawing an empty page', () => {
  page(portOf());
  expect(
    screen.getByRole('heading', { name: english.pluginsEmpty }),
  ).toBeTruthy();
});

it('gives every plugin a row saying which of the three states it is in', async () => {
  page(
    portOf(
      plugin({ id: 'on', name: 'A plugin', entry: 'on/interface.js' }),
      plugin({ id: 'off', name: 'Switched off', enabled: false }),
      plugin({ id: 'broken', name: 'Broken', entry: 'broken/interface.js' }),
    ),
    async (entry) => {
      if (entry.startsWith('broken')) throw new Error('no such file');
      return { default: () => {} };
    },
  );
  // One line each, in the order the kernel listed them — the order the user
  // put the plugins in, which is the same order every position reads in.
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
  await row('A plugin', `A plugin${english.pluginEnabled}`);
  await row('Switched off', `Switched off${english.pluginDisabled}`);
});

it('says why a plugin is not running, in the words for that failure', async () => {
  page(
    portOf(
      plugin({ id: 'broken', name: 'Broken', entry: 'broken/interface.js' }),
      plugin({ id: 'empty', name: 'Empty', entry: 'empty/interface.js' }),
      plugin({ id: 'throws', name: 'Throws', entry: 'throws/interface.js' }),
    ),
    async (entry) => {
      if (entry.startsWith('broken')) throw new Error('no such file');
      if (entry.startsWith('empty')) return {};
      if (entry.startsWith('throws')) {
        return {
          default: () => {
            throw new Error('the factory broke');
          },
        };
      }
      return { default: () => {} };
    },
  );
  // Each of the three ways an interface can fail says which one it was, and
  // names the plugin it happened to. The plugin's own exception is not carried
  // into the row: it is text the interface cannot translate.
  const said = (code: string, name: string) =>
    `${name}${errors[code as keyof typeof errors].replace('{{plugin}}', name)}${english.pluginFailed}`;
  await row('Broken', said('plugin.interface.unreachable', 'Broken'));
  await row('Empty', said('plugin.interface.no_factory', 'Empty'));
  await row('Throws', said('plugin.interface.start_failed', 'Throws'));
});

it('shows what a plugin says it is doing, beside the state it is in', async () => {
  let doing: ((activity: string) => void) | undefined;
  page(
    portOf(plugin({ id: 'on', name: 'A plugin', entry: 'on/interface.js' })),
    async () => ({
      default: (_baseline, context) => {
        doing = context.status;
      },
    }),
  );
  await waitFor(() => expect(doing).toBeDefined());
  await row('A plugin', `A plugin${english.pluginEnabled}`);
  // A plugin's words are its own and arrive in its own language, so they are
  // shown as they are, under a phrase that says whose they are.
  act(() => doing!('fetching a cover'));
  await row(
    'A plugin',
    `A plugin${english.pluginDoing.replace('{{activity}}', 'fetching a cover')}${english.pluginEnabled}`,
  );
});
