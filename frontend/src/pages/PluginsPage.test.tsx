// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import * as doubles from '../test/doubles';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { pickPluginArchive, pickPluginFolder } from '../shared/api';
import { PluginsPage } from './PluginsPage';
import { PluginHostProvider } from '../plugins/PluginHostProvider';
import type { EntryLoader } from '../plugins/host';
import type { PluginBootstrap, PluginPort } from '../plugins/status';
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
// The platform's picker cannot be opened in a test — there is no platform — so
// the two ways a source is chosen are answered by hand. Everything else about
// `shared/api` is the real thing: what this file is about is the dialog that
// asks, not the picker it asks through.
vi.mock('../shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/api')>()),
  pickPluginFolder: vi.fn(),
  pickPluginArchive: vi.fn(),
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
    // The same setting the application's own instance is built with. Without
    // it i18next escapes what it interpolates, and a path arrives with its
    // slashes written as entities — a difference between the test's translator
    // and the window's that would only show up on the strings carrying a path.
    interpolation: { escapeValue: false },
  });
});

afterEach(cleanup);

const plugin = (
  overrides: Partial<PluginBootstrap> & { id: string; name: string },
): PluginBootstrap => ({
  author: 'someone',
  capabilities: [],
  entry: null,
  hasBody: false,
  failure: null,
  enabled: true,
  ...overrides,
});

function portOf(...plugins: PluginBootstrap[]): PluginPort {
  return doubles.pluginPort(plugins);
}

function page(port: PluginPort, loadEntry?: EntryLoader) {
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

it('shows what installing would do before anything is copied', async () => {
  const port = doubles.pluginPort([]);
  const cover = plugin({
    id: 'cover',
    name: 'Cover Fetcher',
    author: 'someone',
    capabilities: ['fetch'],
    entry: 'index.js',
  });
  const preview = vi.fn(async () => ({
    destination: '/data/plugins/cover',
    plugin: cover,
  }));
  const install = vi.fn(async () => [cover]);
  vi.mocked(pickPluginFolder).mockResolvedValue('/downloads/cover');
  page({ ...port, preview, install });

  fireEvent.click(
    await screen.findByRole('button', { name: english.pluginInstall }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: english.pluginInstallFolder }),
  );
  // The pre-flight: where it would land, and what it asks for — read before
  // anything has been copied, which is why nothing has been installed yet.
  await screen.findByText(
    english.pluginInstallInto.replace('{{path}}', '/data/plugins/cover'),
  );
  expect(preview).toHaveBeenCalledWith('/downloads/cover');
  expect(screen.getByText(english.pluginCapabilityFetch)).toBeTruthy();
  expect(install).not.toHaveBeenCalled();

  fireEvent.click(
    await screen.findByRole('button', { name: english.pluginInstallConfirm }),
  );
  // The answer is the list as it now stands, so the page redraws from it: the
  // new plugin is a row without the page asking again.
  await screen.findByText('Cover Fetcher');
  expect(install).toHaveBeenCalledWith('/downloads/cover');
  expect(screen.getByText(english.pluginsRestartHint)).toBeTruthy();
});

it('takes a .zip as readily as a folder, and installs nothing on cancel', async () => {
  const port = doubles.pluginPort([]);
  const preview = vi.fn(async () => ({
    destination: '/data/plugins/cover',
    plugin: plugin({ id: 'cover', name: 'Cover Fetcher', entry: 'index.js' }),
  }));
  const install = vi.fn(async () => []);
  vi.mocked(pickPluginArchive).mockResolvedValue('/downloads/cover.zip');
  page({ ...port, preview, install });

  fireEvent.click(
    await screen.findByRole('button', { name: english.pluginInstall }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: english.pluginInstallArchive }),
  );
  await screen.findByText(
    english.pluginInstallInto.replace('{{path}}', '/data/plugins/cover'),
  );
  expect(preview).toHaveBeenCalledWith('/downloads/cover.zip');

  fireEvent.click(screen.getByRole('button', { name: english.cancel }));
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: english.pluginInstallConfirm }),
    ).toBeNull(),
  );
  expect(install).not.toHaveBeenCalled();
});

it('switches one plugin off and leaves the rest of the list alone', async () => {
  const on = plugin({ id: 'on', name: 'A plugin', entry: 'on/interface.js' });
  const off = plugin({ id: 'off', name: 'Another', enabled: false });
  const setEnabled = vi.fn(async () => [
    { ...on, enabled: false },
    { ...off, enabled: true },
  ]);
  page({ ...doubles.pluginPort([on, off]), setEnabled });
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));

  const boxes = screen.getAllByRole('checkbox', { name: english.pluginEnable });
  expect((boxes[0] as HTMLInputElement).getAttribute('aria-checked')).toBe(
    'true',
  );
  expect((boxes[1] as HTMLInputElement).getAttribute('aria-checked')).toBe(
    'false',
  );

  fireEvent.click(boxes[0]);
  await row('A plugin', `A plugin${english.pluginDisabled}`);
  expect(setEnabled).toHaveBeenCalledWith('on', false);
});

it('asks about the content once, counts it, and keeps it unless told otherwise', async () => {
  const cover = plugin({
    id: 'cover',
    name: 'Cover Fetcher',
    entry: 'index.js',
  });
  const uninstall = vi.fn(async () => []);
  const contentRows = vi.fn(async () => 12);
  page({ ...doubles.pluginPort([cover]), uninstall, contentRows });
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));

  fireEvent.click(
    screen.getByRole('button', { name: english.pluginUninstall }),
  );
  await screen.findByText(
    english.pluginUninstallQuestion.replace('{{plugin}}', 'Cover Fetcher'),
  );
  // The count is the backend's, and it is read before the question is answered.
  await screen.findByText(
    english.pluginUninstallRows.replace('{{countText}}', '12'),
  );
  expect(contentRows).toHaveBeenCalledWith('cover');

  // Keeping the content is what happens by not saying anything.
  fireEvent.click(
    screen.getByRole('button', { name: english.pluginUninstall }),
  );
  await waitFor(() => expect(uninstall).toHaveBeenCalledWith('cover', false));
  await waitFor(() => expect(screen.queryByText('Cover Fetcher')).toBeNull());
});

it('deletes the content only when the user ticks the box', async () => {
  const cover = plugin({
    id: 'cover',
    name: 'Cover Fetcher',
    entry: 'index.js',
  });
  const uninstall = vi.fn(async () => []);
  page({
    ...doubles.pluginPort([cover]),
    uninstall,
    contentRows: async () => 3,
  });
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));

  fireEvent.click(
    screen.getByRole('button', { name: english.pluginUninstall }),
  );
  fireEvent.click(
    await screen.findByRole('checkbox', {
      name: english.pluginUninstallContent,
    }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: english.pluginUninstall }),
  );
  await waitFor(() => expect(uninstall).toHaveBeenCalledWith('cover', true));
});

it('asks a question without a number when the count cannot be read', async () => {
  const cover = plugin({
    id: 'cover',
    name: 'Cover Fetcher',
    entry: 'index.js',
  });
  page({
    ...doubles.pluginPort([cover]),
    contentRows: async () => {
      throw new Error('no such table');
    },
  });
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));

  fireEvent.click(
    screen.getByRole('button', { name: english.pluginUninstall }),
  );
  // The question stands; what is missing is the number. It is not reported as
  // zero: a count this build cannot read is not a count of nothing.
  await screen.findByText(
    english.pluginUninstallQuestion.replace('{{plugin}}', 'Cover Fetcher'),
  );
  expect(
    screen.queryByText(
      english.pluginUninstallRows.replace('{{countText}}', '0'),
    ),
  ).toBeNull();
});

it('puts every plugin aside from one question, and says so on every row', async () => {
  const on = plugin({ id: 'on', name: 'A plugin', entry: 'on/interface.js' });
  const also = plugin({ id: 'also', name: 'Another', entry: 'also/entry.js' });
  const safeMode = vi.fn(async () => [
    { ...on, enabled: false },
    { ...also, enabled: false },
  ]);
  page({ ...doubles.pluginPort([on, also]), safeMode });
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));

  fireEvent.click(screen.getByRole('button', { name: english.pluginSafeMode }));
  await screen.findByText(english.pluginSafeModeQuestion);
  fireEvent.click(
    screen.getByRole('button', { name: english.pluginSafeModeEnter }),
  );

  await row('A plugin', `A plugin${english.pluginDisabled}`);
  await row('Another', `Another${english.pluginDisabled}`);
  expect(safeMode).toHaveBeenCalled();
  // Nothing was uninstalled: the rows are all still there.
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
});
