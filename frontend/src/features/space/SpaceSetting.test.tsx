import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { libraryApi } from '../../shared/api';
import type { Space } from '../../shared/api';
import { idleScan } from '../../test/fixtures';
import { LibraryProvider } from '../library/LibraryProvider';
import { PageFrame } from '../library/PageFrame';
import { SpaceProvider } from './SpaceProvider';
import { SpaceSetting } from './SpaceSetting';
import english from '../../../../shared/locales/en/common.json';
import errors from '../../../../shared/locales/en/errors.json';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const films: Space = { id: 1, name: 'Films' };
const shows: Space = { id: 2, name: 'Shows' };
const i18n = createInstance();
let client: QueryClient;

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    resources: { en: { translation: english, errors } },
  });
  vi.mocked(listen).mockResolvedValue(() => {});
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(libraryApi, 'listSpaces').mockResolvedValue([films, shows]);
  vi.spyOn(libraryApi, 'list').mockResolvedValue([]);
  vi.spyOn(libraryApi, 'directories').mockResolvedValue([]);
  vi.spyOn(libraryApi, 'scanStatus').mockResolvedValue(idleScan());
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

function mount() {
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <SpaceProvider initialSpace={films}>
          <LibraryProvider>
            <PageFrame>
              <SpaceSetting />
            </PageFrame>
          </LibraryProvider>
        </SpaceProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

function nameField() {
  return screen.getByLabelText(english.spaceName) as HTMLInputElement;
}

it('lists every space and marks the one the interface is showing', async () => {
  mount();
  await screen.findByText(shows.name);
  // The badge sits on the row of the space being shown, not merely somewhere on
  // the page: which one the rest of the interface is about is the whole point of
  // it.
  const marked = screen.getByText(english.spaceCurrent).closest('div');
  expect(marked?.textContent).toContain(films.name);
  expect(marked?.textContent).not.toContain(shows.name);
});

it('creates a space from the name that was typed, and moves the library into it', async () => {
  const music: Space = { id: 3, name: 'Music' };
  const create = vi.spyOn(libraryApi, 'createSpace').mockResolvedValue(music);
  mount();
  await screen.findByText(shows.name);
  fireEvent.click(screen.getByRole('button', { name: english.spaceCreate }));
  fireEvent.change(nameField(), { target: { value: 'Music' } });
  fireEvent.click(screen.getByRole('button', { name: english.confirm }));
  await waitFor(() => expect(create).toHaveBeenCalledWith('Music'));
  // The library is read again for the space that was created: moving into it is
  // what makes the new space reachable at all.
  await waitFor(() =>
    expect(vi.mocked(libraryApi.list)).toHaveBeenCalledWith(music.id),
  );
});

it('reports a refused name beside the field and keeps what was typed', async () => {
  vi.spyOn(libraryApi, 'createSpace').mockRejectedValue({
    code: 'space.name.taken',
    params: { name: shows.name },
    errorId: 'err_taken',
  });
  mount();
  await screen.findByText(shows.name);
  fireEvent.click(screen.getByRole('button', { name: english.spaceCreate }));
  fireEvent.change(nameField(), { target: { value: 'Shows' } });
  fireEvent.click(screen.getByRole('button', { name: english.confirm }));
  expect(
    await screen.findByText('Another space is already called “Shows”.'),
  ).toBeTruthy();
  // The dialog is still there with the text in it, so a fix costs a keystroke
  // rather than the whole name again.
  expect(nameField().value).toBe('Shows');
});

it('renames through the same dialog, starting from the name the space has', async () => {
  const rename = vi
    .spyOn(libraryApi, 'renameSpace')
    .mockResolvedValue({ ...shows, name: 'Series' });
  mount();
  await screen.findByText(shows.name);
  const rows = screen.getAllByRole('button', { name: english.spaceRename });
  fireEvent.click(rows[1]);
  expect(nameField().value).toBe(shows.name);
  fireEvent.change(nameField(), { target: { value: 'Series' } });
  fireEvent.click(screen.getByRole('button', { name: english.confirm }));
  await waitFor(() => expect(rename).toHaveBeenCalledWith(shows.id, 'Series'));
});

it('says what a deletion costs, and moves the library onto a space that is there', async () => {
  const remove = vi.spyOn(libraryApi, 'deleteSpace').mockResolvedValue(shows);
  mount();
  await screen.findByText(shows.name);
  const rows = screen.getAllByRole('button', { name: english.spaceRemove });
  // The row of the space being shown: deleting that one is the case where the
  // interface has to end up somewhere real rather than on what it just removed.
  fireEvent.click(rows[0]);
  expect(
    screen.getByText(
      'Delete “Films”? Its favorites and play history will be erased. The video files on disk are not touched.',
    ),
  ).toBeTruthy();
  // Nothing has gone yet: the question is a question.
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: english.confirm }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith(films.id));
  await waitFor(() =>
    expect(vi.mocked(libraryApi.list)).toHaveBeenCalledWith(shows.id),
  );
});

it('offers the space operations while no media task holds the scan slot', async () => {
  mount();
  await screen.findByText(shows.name);
  expect(screen.queryByText(english.spaceBlockedScanning)).toBeNull();
  expect(
    screen
      .getByRole('button', { name: english.spaceCreate })
      .hasAttribute('disabled'),
  ).toBe(false);
});

it('explains a running scan as the reason the space operations are unavailable', async () => {
  vi.mocked(libraryApi.scanStatus).mockResolvedValue(
    idleScan({ phase: 'processing' }),
  );
  mount();
  await screen.findByText(shows.name);
  expect(await screen.findByText(english.spaceBlockedScanning)).toBeTruthy();
  for (const name of [english.spaceCreate, english.spaceRename]) {
    expect(
      screen.getAllByRole('button', { name })[0].hasAttribute('disabled'),
    ).toBe(true);
  }
  expect(
    screen
      .getAllByRole('button', { name: english.spaceRemove })[0]
      .hasAttribute('disabled'),
  ).toBe(true);
});

it('carries a refused deletion out to the notice, where its reason can be read', async () => {
  vi.spyOn(libraryApi, 'deleteSpace').mockRejectedValue({
    code: 'space.remove_last',
    params: {},
    errorId: 'err_last',
  });
  mount();
  await screen.findByText(shows.name);
  const rows = screen.getAllByRole('button', { name: english.spaceRemove });
  fireEvent.click(rows[1]);
  fireEvent.click(screen.getByRole('button', { name: english.confirm }));
  expect(
    await screen.findByText(
      'Enjoy always keeps at least one space, so the last one cannot be removed.',
    ),
  ).toBeTruthy();
});
