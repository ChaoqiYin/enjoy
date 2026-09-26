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
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { libraryApi } from '../../shared/api';
import type { Space } from '../../shared/api';
import { idleScan } from '../../test/fixtures';
import { LibraryProvider } from '../library/LibraryProvider';
import { SpaceProvider } from './SpaceProvider';
import { SpaceSwitcher } from './SpaceSwitcher';
import english from '../../../../shared/locales/en/common.json';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const films: Space = { id: 1, name: 'Films' };
const shows: Space = { id: 2, name: 'Shows' };
const i18n = createInstance();
let client: QueryClient;

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  vi.mocked(listen).mockResolvedValue(() => {});
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(libraryApi, 'listSpaces').mockResolvedValue([films, shows]);
  vi.spyOn(libraryApi, 'list').mockResolvedValue([]);
  vi.spyOn(libraryApi, 'directories').mockResolvedValue([]);
  vi.spyOn(libraryApi, 'scanStatus').mockResolvedValue(idleScan());
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

function mount(initialSpace: Space = films) {
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <SpaceProvider initialSpace={initialSpace}>
            <LibraryProvider>
              <SpaceSwitcher />
            </LibraryProvider>
          </SpaceProvider>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

function menu() {
  return document.querySelector('details')!;
}

// The trigger is a `summary`, which is a disclosure control rather than a
// button as far as the accessibility tree this test reads is concerned, so it
// is found by its place rather than by a role.
function trigger() {
  return menu().querySelector('summary')!;
}

it('names the space being shown, even when it is the only one', async () => {
  // Shown rather than waiting for a second space to exist: a control that
  // appears only once it is useful is one nobody knows is there.
  vi.mocked(libraryApi.listSpaces).mockResolvedValue([films]);
  mount();
  await screen.findByText(films.name);
  expect(trigger().textContent).toContain(films.name);
});

it('lists every space and marks the one being shown', async () => {
  mount();
  await screen.findByText(shows.name);
  const marked = screen.getByRole('button', { current: true });
  expect(marked.textContent).toContain(films.name);
  expect(screen.getByRole('button', { name: shows.name })).toBeTruthy();
});

it('keeps the whole of a name that does not fit, one hover away', async () => {
  const long: Space = { id: 3, name: 'Feature films and documentaries' };
  vi.mocked(libraryApi.listSpaces).mockResolvedValue([long]);
  mount(long);
  await screen.findByText(long.name);
  // The trigger is truncated by width, so the full name has to be readable
  // somewhere other than the control itself.
  expect(document.querySelector(`[data-tip="${long.name}"]`)).toBeTruthy();
});

it('moves the library to the space that was chosen', async () => {
  const switchTo = vi.spyOn(libraryApi, 'switchSpace').mockResolvedValue(shows);
  mount();
  await screen.findByText(shows.name);
  fireEvent.click(screen.getByRole('button', { name: shows.name }));
  await waitFor(() => expect(switchTo).toHaveBeenCalledWith(shows.id));
  // Everything the pages read is addressed to the space being shown, so the
  // library asking for the new one is what "the pages followed" means.
  await waitFor(() =>
    expect(vi.mocked(libraryApi.list)).toHaveBeenCalledWith(shows.id),
  );
  expect(menu().open).toBe(false);
});

it('leaves the space it is already showing alone', async () => {
  const switchTo = vi.spyOn(libraryApi, 'switchSpace');
  mount();
  await screen.findByText(shows.name);
  fireEvent.click(screen.getByRole('button', { current: true }));
  expect(switchTo).not.toHaveBeenCalled();
});

it('opens on the trigger when nothing is in the way', async () => {
  mount();
  await screen.findByText(shows.name);
  fireEvent.click(trigger());
  expect(menu().open).toBe(true);
});

it('will not open while a media task holds the scan slot, and says why', async () => {
  // Paused, because a paused pass is still a pass: the slot is held, so the
  // answer has to be the same one.
  vi.mocked(libraryApi.scanStatus).mockResolvedValue(
    idleScan({ phase: 'paused' }),
  );
  mount();
  await screen.findByText(shows.name);
  await waitFor(() =>
    expect(trigger().hasAttribute('aria-disabled')).toBe(true),
  );
  fireEvent.click(trigger());
  expect(menu().open).toBe(false);
  // The reason takes the place of the name: a control that will not open owes
  // the user the reason rather than a label they can already read.
  expect(
    document.querySelector(`[data-tip="${english.spaceBlockedScanning}"]`),
  ).toBeTruthy();
});

it('offers the way to the settings section it is about', async () => {
  mount();
  const link = await screen.findByRole('link', {
    name: english.spaceManage,
  });
  expect(link.getAttribute('href')).toBe('/settings#spaces');
});

it('closes on Escape and hands the focus back to the trigger', async () => {
  mount();
  await screen.findByText(shows.name);
  menu().open = true;
  fireEvent.keyDown(menu(), { key: 'Escape' });
  expect(menu().open).toBe(false);
  expect(document.activeElement).toBe(trigger());
});

it('closes when the click lands outside it', async () => {
  mount();
  await screen.findByText(shows.name);
  menu().open = true;
  fireEvent.mouseDown(document.body);
  expect(menu().open).toBe(false);
});
