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
import * as doubles from '../../test/doubles';
import { idleScan } from '../../test/fixtures';
import { LibraryProvider } from '../library/LibraryProvider';
import { SpaceProvider } from './SpaceProvider';
import { SpaceSwitcher } from './SpaceSwitcher';
import english from '../../../../shared/locales/en/common.json';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
// The 共享服务, as this control reads it. It is a stand-in and not the real
// provider: what this file is about is when the question gets asked, and the
// provider's own work — asking the backend, holding the prompt for a window
// close — belongs to its tests.
const share = doubles.share();
vi.mock('../share/ShareProvider', () => ({
  useShareContext: () => share,
}));

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms per call; the panel Radix anchors to the trigger asks every
// ancestor whether it sits in the top layer, so one open list spends seconds of
// that. Nothing here is a top-layer element, so answering `false` outright is
// both correct and instant.
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

const films: Space = { id: 1, name: 'Films' };
const shows: Space = { id: 2, name: 'Shows' };
const i18n = createInstance();
let client: QueryClient;

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  vi.mocked(listen).mockResolvedValue(() => {});
  Object.assign(share, doubles.share());
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(libraryApi, 'listSpaces').mockResolvedValue([films, shows]);
  vi.spyOn(libraryApi, 'list').mockResolvedValue({ items: [], total: 0 });
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

// The control, found before the list is up: once it is open the space being
// shown is named twice — on the trigger and on its row — and these tests mean
// the control itself. It is a real button here, so it is found by its role.
function trigger(name = films.name) {
  return screen.getByRole('button', { name });
}

/** Opens the list and waits for the spaces to arrive behind it. */
async function openList(name = films.name) {
  const control = trigger(name);
  fireEvent.click(control);
  await screen.findByRole('button', { name: shows.name });
  return control;
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
  await openList();
  const marked = screen.getByRole('button', { current: true });
  expect(marked.textContent).toContain(films.name);
  expect(screen.getByRole('button', { name: shows.name })).toBeTruthy();
});

it('shows a name too long for the trigger in the list, not on hover', async () => {
  const long: Space = { id: 3, name: 'Feature films and documentaries' };
  vi.mocked(libraryApi.listSpaces).mockResolvedValue([long]);
  mount(long);
  // The trigger is one fixed width, so a long name is cut there by CSS. Nothing
  // recovers it on hover: the list below wraps rather than cutting, so the whole
  // name is one click away instead — the click a tooltip would have asked for.
  const control = trigger(long.name);
  fireEvent.click(control);
  const item = await screen.findByRole('button', {
    name: long.name,
    current: true,
  });
  expect(item.textContent).toBe(long.name);
  expect(document.querySelector('[data-tip]')).toBeNull();
  expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull();
});

it('moves the library to the space that was chosen', async () => {
  const switchTo = vi.spyOn(libraryApi, 'switchSpace').mockResolvedValue(shows);
  mount();
  const control = await openList();
  fireEvent.click(screen.getByRole('button', { name: shows.name }));
  await waitFor(() => expect(switchTo).toHaveBeenCalledWith(shows.id));
  // Everything the pages read is addressed to the space being shown, so the
  // library asking for the new one is what "the pages followed" means.
  await waitFor(() =>
    expect(vi.mocked(libraryApi.list)).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: shows.id }),
    ),
  );
  // And the list went away with the choice.
  expect(control.getAttribute('aria-expanded')).toBe('false');
});

it('leaves the space it is already showing alone', async () => {
  const switchTo = vi.spyOn(libraryApi, 'switchSpace');
  mount();
  await openList();
  fireEvent.click(screen.getByRole('button', { current: true }));
  expect(switchTo).not.toHaveBeenCalled();
});

it('asks before leaving a space the 共享服务 is serving', async () => {
  const switchTo = vi.spyOn(libraryApi, 'switchSpace').mockResolvedValue(shows);
  share.port = 4918;
  mount();
  await openList();
  fireEvent.click(screen.getByRole('button', { name: shows.name }));

  // The question, and the answer that it has not been carried out yet: the
  // service belongs to the space that started it, so moving would end it, and
  // a device in the middle of a film is the cost of not asking.
  const question = await screen.findByRole('dialog');
  // The sentence the user is asked, with the space they picked named in it: a
  // question about leaving without saying where to is one they cannot weigh.
  expect(question.textContent).toContain(
    english.spaceSwitchQuestion.replace('{{name}}', shows.name),
  );
  expect(switchTo).not.toHaveBeenCalled();
  expect(share.stop).not.toHaveBeenCalled();
});

it('ends the service and moves on the answer that means yes', async () => {
  const switchTo = vi.spyOn(libraryApi, 'switchSpace').mockResolvedValue(shows);
  share.port = 4918;
  mount();
  await openList();
  fireEvent.click(screen.getByRole('button', { name: shows.name }));
  fireEvent.click(await screen.findByRole('button', { name: english.confirm }));

  await waitFor(() => expect(share.stop).toHaveBeenCalled());
  // And in that order: a move that happened first would leave the service
  // serving the space that is no longer on screen.
  await waitFor(() => expect(switchTo).toHaveBeenCalledWith(shows.id));
  expect(vi.mocked(share.stop).mock.invocationCallOrder[0]).toBeLessThan(
    switchTo.mock.invocationCallOrder[0],
  );
});

it('stays where it is on the answer that means no', async () => {
  const switchTo = vi.spyOn(libraryApi, 'switchSpace');
  share.port = 4918;
  mount();
  await openList();
  fireEvent.click(screen.getByRole('button', { name: shows.name }));
  fireEvent.click(await screen.findByRole('button', { name: english.cancel }));

  expect(screen.queryByRole('dialog')).toBeNull();
  expect(share.stop).not.toHaveBeenCalled();
  expect(switchTo).not.toHaveBeenCalled();
  // Still showing the space it was, which is the whole of what "no" means. The
  // list is closed by now, so the only place left naming it is the control.
  expect(trigger().textContent).toContain(films.name);
});

it('moves without a word while nothing is being shared', async () => {
  const switchTo = vi.spyOn(libraryApi, 'switchSpace').mockResolvedValue(shows);
  mount();
  await openList();
  fireEvent.click(screen.getByRole('button', { name: shows.name }));

  // A prompt with nothing behind it teaches the user to dismiss prompts.
  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(switchTo).toHaveBeenCalledWith(shows.id));
});

it('opens on the trigger when nothing is in the way', async () => {
  mount();
  const control = trigger();
  fireEvent.click(control);
  await screen.findByRole('button', { name: shows.name });
  expect(control.getAttribute('aria-expanded')).toBe('true');
});

it('will not open while a media task holds the scan slot, and says why', async () => {
  // Paused, because a paused pass is still a pass: the slot is held, so the
  // answer has to be the same one.
  vi.mocked(libraryApi.scanStatus).mockResolvedValue(
    idleScan({ phase: 'paused' }),
  );
  mount();
  const control = trigger();
  await screen.findByText(films.name);
  await waitFor(() => expect(control.hasAttribute('aria-disabled')).toBe(true));
  fireEvent.click(control);
  expect(control.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('button', { name: shows.name })).toBeNull();
  // Nothing repeats the name or the reason on hover any more, so the reason has
  // to reach the accessibility tree some other way: a control that will not open
  // owes the user the reason.
  const described = control.getAttribute('aria-describedby');
  expect(described).toBeTruthy();
  expect(document.getElementById(described!)?.textContent).toBe(
    english.spaceBlockedScanning,
  );
});

it('offers no way into settings from the list', async () => {
  mount();
  await openList();
  // The list is the spaces and nothing else. Settings has its own entry in the
  // navigation, which is where the whole application is reached from.
  expect(screen.queryByRole('link')).toBeNull();
});

it('closes on Escape and hands the focus back to the trigger', async () => {
  mount();
  const control = await openList();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: shows.name })).toBeNull(),
  );
  await vi.waitFor(() => expect(document.activeElement).toBe(control));
});

// A click outside the list closes it too, and that is Radix's
// `DismissableLayer`. jsdom cannot show it: Radix reads the `pointerdown` it
// gets there as an outside interaction it has already intercepted and
// suppresses the close. Escape travels the same dismissal path, and that is
// what is checked above instead.
