// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import * as doubles from '../test/doubles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listen } from '@tauri-apps/api/event';
import { App } from './App';
import { libraryApi } from '../shared/api';
import { useLibraryView } from '../features/library/libraryView';
import english from '../../../shared/locales/en/common.json';

// What the pages read of the library, one double per module — all seven of
// them, because which page is on screen decides which are read. Each is built
// from the slice's own type, so a key one of them grows is a compile error in
// `doubles` rather than a route test that goes on passing without ever naming
// the thing the new key describes.
vi.mock('../features/library/LibraryProvider', () => ({
  // Nothing below reads the context: the seven modules it would feed are
  // doubled as well, so the provider is here only to keep the real queries and
  // the event subscriptions out of a test that is about which page is on
  // screen.
  LibraryProvider: ({ children }: { children: ReactNode }) => children,
  useLibraryContext: () => ({}),
}));
vi.mock('../features/library/useVideos', () => ({
  useVideos: () => doubles.videos(),
}));
vi.mock('../features/library/useScan', () => ({
  useScan: () => doubles.scan(),
}));
vi.mock('../features/library/useNotices', () => ({
  useNotices: () => doubles.notices(),
}));
vi.mock('../features/library/useBusy', () => ({
  useBusy: () => doubles.busy(),
}));
vi.mock('../features/library/useDirectories', () => ({
  useDirectories: () => doubles.directories(),
}));
vi.mock('../features/library/useSpaceCommands', () => ({
  useSpaceCommands: () => doubles.spaceCommands(),
}));
vi.mock('../features/library/useVideoActions', () => ({
  useVideoActions: () => doubles.videoActions(),
}));
vi.mock('../i18n/LanguageSetting', () => ({
  LanguageFocusSync: () => null,
  LanguageSetting: () => null,
}));
// The one subscription left in the real tree: the sharing state follows the
// close question for the life of the interface (`ShareProvider`). The library's
// own subscriptions are out with its provider, above.
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
const i18n = createInstance();
// Not "Library": the navigation has a tab by that name, and a page that shows
// the space it is about is the thing being looked for here.
const space = { id: 1, name: 'Films' };
let client: QueryClient;
beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(libraryApi, 'listSpaces').mockResolvedValue([space]);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  // A subscription that can be stopped, which is all the provider asks of it.
  vi.mocked(listen).mockResolvedValue(vi.fn() as never);
  useLibraryView.setState({ search: '', folder: '', sorts: {} });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(path = '/') {
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[path]}>
          <App initialSpace={space} />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}
function navigate(name: string) {
  fireEvent.click(screen.getByRole('link', { name }));
}
it('renders independent pages with shared navigation and page-specific actions', () => {
  mount();
  const navigation = screen.getByRole('navigation');
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    english.library,
  );
  expect(screen.getByRole('button', { name: english.rescan })).toBeTruthy();
  // The space is named in the header, which every page shares, so it says what
  // the rest of the screen is about wherever the user is.
  expect(headerSpace()).toBe(space.name);
  navigate(english.favorites);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    english.favorites,
  );
  expect(screen.getByText(english.emptyFavorites)).toBeTruthy();
  expect(screen.queryByRole('button', { name: english.add })).toBeNull();
  navigate(english.history);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    english.history,
  );
  expect(screen.getByText(english.emptyHistory)).toBeTruthy();
  navigate(english.settings);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    english.settings,
  );
  expect(screen.queryByPlaceholderText(english.searchPlaceholder)).toBeNull();
  expect(screen.getByRole('button', { name: english.add })).toBeTruthy();
  // The folder list is named after the space it belongs to, because each space
  // keeps its own and this is the list of one of them.
  expect(
    screen.getByRole('heading', {
      level: 2,
      name: english.foldersInSpace.replace('{{name}}', space.name),
    }),
  ).toBeTruthy();
  expect(screen.getByRole('navigation')).toBe(navigation);
  expect(headerSpace()).toBe(space.name);
});
function headerSpace() {
  return document.querySelector('summary')?.textContent;
}
it('retains shared search and separate route sorting after page remounts', () => {
  mount();
  fireEvent.change(screen.getByPlaceholderText(english.searchPlaceholder), {
    target: { value: 'example' },
  });
  const sortControl = () =>
    screen.getAllByRole('combobox')[1] as HTMLSelectElement;
  fireEvent.change(sortControl(), { target: { value: 'name' } });
  navigate(english.history);
  expect(sortControl().value).toBe('played');
  expect(
    (screen.getByPlaceholderText(english.searchPlaceholder) as HTMLInputElement)
      .value,
  ).toBe('example');
  navigate(english.library);
  expect(sortControl().value).toBe('name');
});
it('supports direct page entry and redirects unknown paths to the library', () => {
  mount('/favorites');
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    english.favorites,
  );
  cleanup();
  mount('/missing');
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    english.library,
  );
});

it.each(['/', '/settings'])(
  'requests confirmation without opening directory selection on %s',
  (path) => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    mount(path);
    fireEvent.click(screen.getByRole('button', { name: english.rescan }));
    expect(screen.getByText(english.noFoldersRescan)).toBeTruthy();
    expect(
      screen.queryByRole('dialog', { name: english.addVideos }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: english.cancel }));
  },
);
