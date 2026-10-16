import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PluginHostProvider } from './PluginHostProvider';
import { PluginPageView, pluginPagePath } from './PluginPageView';
import type { PluginContext } from './host';
import type { AppPageParams } from './mountPoints';
import type { PluginBootstrap, PluginPort } from './status';
import { pluginPort } from '../test/doubles';
import english from '../../../shared/locales/en/common.json';

// The space is the provider stack's, and this file is about the page rather
// than about where the space comes from.
vi.mock('../features/space/SpaceProvider', () => ({
  useSpace: () => ({ id: 7, name: 'Films' }),
}));

// A page a plugin registered is the render side of `app.page`: the navigation
// gives it a place, and what is held to here is that the plugin's own component
// is what is drawn there, that the page says it is the plugin's rather than the
// kernel's, and that a place with no page on it goes back to the list.

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

const plugin: PluginBootstrap = {
  id: 'a-plugin',
  name: 'A plugin',
  author: 'someone',
  capabilities: [],
  enabled: true,
  entry: 'a/interface.js',
  hasBody: false,
  failure: null,
};

function portOf(...plugins: PluginBootstrap[]): PluginPort {
  return pluginPort(plugins);
}

/** A plugin interface that registers one page, which draws the space it was
 * handed — the whole of what `app.page` passes a plugin. */
function loader(drawn: AppPageParams[] = []) {
  return async () => ({
    default: (_baseline: unknown, context: PluginContext) => {
      context.draw('app.page', {
        key: 'covers',
        label: 'Covers',
        draw: (params: AppPageParams) => {
          drawn.push(params);
          return <p>the plugin's own page</p>;
        },
      });
    },
  });
}

function view(path: string, loadEntry = loader()) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <PluginHostProvider port={portOf(plugin)} loadEntry={loadEntry}>
          <Routes>
            <Route
              path="/plugins/:pluginId/:page"
              element={<PluginPageView />}
            />
            <Route path="/plugins" element={<p>the plugins page</p>} />
          </Routes>
        </PluginHostProvider>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

it('draws the page the plugin registered, in the space the window is in', async () => {
  const drawn: AppPageParams[] = [];
  view(pluginPagePath('a-plugin', 'covers'), loader(drawn));
  await waitFor(() =>
    expect(screen.getByText("the plugin's own page")).toBeTruthy(),
  );
  expect(drawn).toEqual([{ space: { id: 7 } }]);
});

it('says whose page it is, so it does not read as the kernel own', async () => {
  view(pluginPagePath('a-plugin', 'covers'));
  await waitFor(() =>
    expect(
      screen.getByText(english.pluginPageBy.replace('{{plugin}}', 'A plugin')),
    ).toBeTruthy(),
  );
});

it('goes back to the list of plugins when there is no page there', async () => {
  // A plugin that was unloaded — or a link to a page that has gone — is not a
  // blank screen: the list of what is installed is the page that answers it.
  view(pluginPagePath('a-plugin', 'no-such-page'));
  await waitFor(() =>
    expect(screen.getByText('the plugins page')).toBeTruthy(),
  );
});
