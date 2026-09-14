import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { useLibraryView } from '../features/library/libraryView';
import english from '../../../shared/locales/en/common.json';

vi.mock('../features/library/useLibrary', () => ({
  useLibrary: () => ({
    run: async (action: () => Promise<unknown>) => action(),
    videos: { data: [], isPending: false },
    directories: { data: [] },
    scan: { data: undefined },
    busy: false,
    error: null,
    completion: null,
  }),
}));
vi.mock('../i18n/LanguageSetting', () => ({
  LanguageFocusSync: () => null,
  LanguageSetting: () => null,
}));
const i18n = createInstance();
beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
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
  vi.unstubAllGlobals();
});
function mount(path = '/') {
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </I18nextProvider>,
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
  expect(screen.getByRole('navigation')).toBe(navigation);
});
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
