import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LibraryToolbar } from './LibraryToolbar';
import english from '../../../../shared/locales/en/common.json';

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms per call; floating-ui asks every ancestor of the panel
// whether it sits in the top layer, so opening one list spends several seconds
// of that. Nothing here is a top-layer element, so answering `false` outright is
// both correct and instant (界面迁移的已知坑 §4).
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

// jsdom lays nothing out and implements no scrolling, which is what Radix
// reaches for when it brings the chosen option into view.
Element.prototype.scrollIntoView = vi.fn();

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

function toolbar(
  overrides: Partial<Parameters<typeof LibraryToolbar>[0]> = {},
) {
  const props: Parameters<typeof LibraryToolbar>[0] = {
    title: 'Library',
    folders: [],
    search: '',
    folder: '',
    sort: 'newest',
    viewMode: 'grid',
    onSearchChange: vi.fn(),
    onFolderChange: vi.fn(),
    onSortChange: vi.fn(),
    onViewModeChange: vi.fn(),
    ...overrides,
  };
  return render(
    <I18nextProvider i18n={i18n}>
      <LibraryToolbar {...props} />
    </I18nextProvider>,
  );
}

it('names the page and offers the four ways to narrow it', () => {
  toolbar();
  expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy();
  expect(screen.getByRole('searchbox', { name: 'Search' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Folder' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Sort' })).toBeTruthy();
  expect(screen.getByRole('radiogroup', { name: 'View' })).toBeTruthy();
});

it('shows the page actions beside the title', () => {
  toolbar({ actions: <button type="button">Add folders</button> });
  expect(screen.getByRole('button', { name: 'Add folders' })).toBeTruthy();
});

it('narrows the list by what was typed', () => {
  const onSearchChange = vi.fn();
  toolbar({ onSearchChange });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
    target: { value: 'holiday' },
  });
  expect(onSearchChange).toHaveBeenCalledWith('holiday');
});

it('offers the whole library first, then each folder it holds', () => {
  toolbar({ folders: ['/movies', '/shows'] });
  fireEvent.click(screen.getByRole('combobox', { name: 'Folder' }));
  // 「全部目录」 is the absence of a filter rather than a folder, and it is the
  // toolbar that says so: the folders themselves arrive as paths, which is what
  // the backend is asked for.
  expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual(
    ['All folders', '/movies', '/shows'],
  );
});

it('narrows the list to the folder that was picked', () => {
  const onFolderChange = vi.fn();
  toolbar({ folders: ['/movies', '/shows'], onFolderChange });
  fireEvent.click(screen.getByRole('combobox', { name: 'Folder' }));
  fireEvent.click(screen.getByRole('option', { name: '/shows' }));
  expect(onFolderChange).toHaveBeenCalledWith('/shows');
});

it('names every order it can read the list in', () => {
  toolbar({ sort: 'played' });
  fireEvent.click(screen.getByRole('combobox', { name: 'Sort' }));
  // The words are the vocabulary's (`SORT_ORDER_LABELS`), drawn translated: a
  // dropdown reading 最近播放 is drawing the same word the 最近播放页 is named with.
  expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual(
    ['Recently added', 'Recently played', 'File name', 'File size'],
  );
});

it('reads the list in the order that was picked', () => {
  const onSortChange = vi.fn();
  toolbar({ onSortChange });
  fireEvent.click(screen.getByRole('combobox', { name: 'Sort' }));
  fireEvent.click(screen.getByRole('option', { name: 'File size' }));
  expect(onSortChange).toHaveBeenCalledWith('size');
});

it('redraws the list in the shape that was picked', () => {
  const onViewModeChange = vi.fn();
  toolbar({ onViewModeChange });
  fireEvent.click(screen.getByRole('radio', { name: 'Table view' }));
  expect(onViewModeChange).toHaveBeenCalledWith('table');
});

it('offers no way to narrow a library it is still reading', () => {
  // While the list is being fetched there is nothing to narrow: a control that
  // accepted a search here would be filtering records the page does not have.
  toolbar({ disabled: true });
  expect(
    (screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole('combobox', { name: 'Sort' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
