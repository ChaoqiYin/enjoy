// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import {
  address,
  backend,
  busy,
  device,
  library,
  notices,
  resetSharePage,
  scan,
  setClipboard,
  status,
  videoActions,
  windowMock,
} from '../../test/sharePage';
import { video } from '../../test/fixtures';
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
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { ShareProvider } from './ShareProvider';
import { SharePage } from '../../pages/SharePage';
import english from '../../../../shared/locales/en/common.json';
import errors from '../../../../shared/locales/en/errors.json';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  convertFileSrc: (path: string) => path,
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: (
      handler: (event: { preventDefault: () => void }) => void,
    ) => windowMock.onCloseRequested(handler),
    destroy: () => windowMock.destroy(),
  }),
}));
vi.mock('../library/useVideos', () => ({ useVideos: () => library }));
// The cards in the 共享清单 act through the library's own actions, which is a
// slice with its own tests; what this file is about is which cards are drawn.
vi.mock('../library/useVideoActions', () => ({
  useVideoActions: () => videoActions,
}));
vi.mock('../library/useBusy', () => ({ useBusy: () => busy }));
vi.mock('../library/useScan', () => ({ useScan: () => scan }));
vi.mock('../library/useNotices', () => ({ useNotices: () => notices }));
// The page reads the current space to name it when starting the service. What
// the space *is* belongs to the space provider's own tests; what this file is
// about is which space the command was told.
vi.mock('../space/SpaceProvider', () => ({
  useSpace: () => ({ id: 7, name: 'Acceptance' }),
}));

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english, errors } },
  });
  resetSharePage(invoke);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window.navigator as { clipboard?: unknown }).clipboard;
});

/** The page, with the provider above it and a router: the page links back to
 *  the library when there is nothing on the list. */
function page() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <ShareProvider>
          <SharePage />
        </ShareProvider>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

it('offers to start the service, and shows the port it ended up on', async () => {
  backend(invoke, {
    share_status: status(),
    open_share: status({ port: 4918 }),
  });
  page();
  const start = await screen.findByRole('button', {
    name: english.startSharing,
  });
  fireEvent.click(start);

  // The space travels with the command: the backend offers one space's 共享清单
  // and cannot know which one is on screen.
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('open_share', { spaceId: 7 }),
  );
  // The state follows the answer, not the request: the button turns into the
  // one that ends the service only once the backend has said one is running.
  expect(
    await screen.findByRole('button', { name: english.stopSharing }),
  ).toBeTruthy();
  // The port the backend ended up on, and not the one it was asked for: this
  // test answers with 4918 through a fixture and a different one through the
  // status, and what is on screen is the one the service is really on.
  expect(
    screen.getByText(english.sharingOn.replace('{{port}}', '4918')),
  ).toBeTruthy();
});

it('ends a service that is running', async () => {
  backend(invoke, {
    share_status: status({ port: 4918 }),
    close_share: status(),
  });
  page();
  const stop = await screen.findByRole('button', { name: english.stopSharing });
  fireEvent.click(stop);

  await waitFor(() => expect(invoke).toHaveBeenCalledWith('close_share'));
  expect(
    await screen.findByRole('button', { name: english.startSharing }),
  ).toBeTruthy();
});

it('says so, beside the reference, when the service cannot start', async () => {
  vi.mocked(invoke).mockImplementation((async (command: string) => {
    if (command === 'share_status') return status();
    throw {
      code: 'share.port.in_use',
      params: { port: '4918', count: '10' },
      errorId: 'err_test',
    };
  }) as never);
  page();
  fireEvent.click(
    await screen.findByRole('button', { name: english.startSharing }),
  );
  // The failure floats, so it is readable from wherever the user has got to,
  // and it names the reference the log is searched by.
  expect(await screen.findByText(english.operationFailed)).toBeTruthy();
  expect(
    screen.getByText(
      errors['share.port.in_use']
        .replace('{{port}}', '4918')
        .replace('{{count}}', '10'),
    ),
  ).toBeTruthy();
  // Nothing started, so the interface is still offering to start.
  expect(
    screen.getByRole('button', { name: english.startSharing }),
  ).toBeTruthy();
});

it('will not start over an empty share list, and says what to do', async () => {
  library.videos.data = [video()];
  backend(invoke, { share_status: status() });
  page();
  const start = await screen.findByRole('button', {
    name: english.startSharing,
  });
  // A port a device can connect to and find nothing on reads as a service that
  // is broken, so the answer is refused before it is asked for — and the reason
  // is said rather than left to a greyed-out button to explain.
  expect(start.hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(english.shareListEmpty)).toBeTruthy();
  expect(
    screen.getByRole('link', { name: english.shareListEmptyAction }),
  ).toBeTruthy();

  // And offered as soon as there is something to offer.
  cleanup();
  library.videos.data = [video({ shared: true })];
  page();
  expect(
    (
      await screen.findByRole('button', { name: english.startSharing })
    ).hasAttribute('disabled'),
  ).toBe(false);
  expect(screen.queryByText(english.shareListEmpty)).toBeNull();
});

it('shows the videos that are on the list, and how many there are', async () => {
  library.videos.data = [
    video({ shared: true, id: 1, file_name: 'first.mp4' }),
    video({ shared: true, id: 2, file_name: 'second.mp4' }),
    // Not on the list, and not drawn: what this block is for is seeing what is
    // being offered, and a card the service would not serve would answer the
    // wrong question.
    video({ id: 3, file_name: 'third.mp4' }),
  ];
  backend(invoke, { share_status: status() });
  page();
  // The heading, then the count, then the cards themselves: the list is a view
  // of the records rather than a command of its own (the backend has none), so
  // what is drawn here is what the library already knows.
  expect(
    await screen.findByRole('heading', { name: english.shareListTitle }),
  ).toBeTruthy();
  expect(
    screen.getByText(english.videoCount_other.replace('{{countText}}', '2')),
  ).toBeTruthy();
  expect(screen.getByText('first.mp4')).toBeTruthy();
  expect(screen.getByText('second.mp4')).toBeTruthy();
  expect(screen.queryByText('third.mp4')).toBeNull();
});

it('gives the room a hover needs to the viewport that clips, not to the grid', async () => {
  backend(invoke, { share_status: status() });
  const { container } = page();
  await screen.findByText('example.mp4');
  // The room the first column's hover paints into is the clip's to give: an
  // `overflow` box clips at its padding box, and a descendant's negative start
  // margin is the one thing such a box cannot scroll to, so room kept by the
  // grid was room spent outside the glass. Measured on the built page, the
  // first column's card sat 1.61px past the clip edge with its lift 4.92px
  // above it, its shadow sliced off along both. jsdom lays nothing out, so what
  // this proves is where the room was put; that it is enough is the browser's
  // measurement, in `videoCardBox` and ADR 0008.
  const viewport = container.querySelector<HTMLElement>('.scroll-viewport')!;
  expect(viewport.style.paddingInlineStart).toBe('10px');
  expect(viewport.style.marginInlineStart).toBe('-10px');
  expect(container.querySelector('.grid')?.getAttribute('style')).not.toContain(
    'padding',
  );
});

it('offers 移出共享清单 from the cards it draws', async () => {
  backend(invoke, { share_status: status() });
  page();
  // The same menu the library opens, on the same event: a page that draws the
  // library's cards owes them the library's menu, and this is the one entry
  // that matters here — the list is picked at, and this is where it is unpicked.
  const card = (await screen.findByText('example.mp4')).closest('article')!;
  fireEvent.contextMenu(card, { clientX: 10, clientY: 20 });
  fireEvent.click(
    await screen.findByRole('menuitem', { name: english.unshare }),
  );
  expect(videoActions.toggleShared).toHaveBeenCalledWith(
    expect.objectContaining({ id: 1 }),
  );
});

it('says a running service is offering the list it was started with, after a change', async () => {
  backend(invoke, { share_status: status({ port: 4918, listChanged: true }) });
  page();
  // The service keeps what it started with, so a list that has been added to
  // since is not what a client is being offered — and a user who just added a
  // video would otherwise conclude the change did not work.
  expect(await screen.findByText(english.shareListChanged)).toBeTruthy();
});

it('says nothing about the list while it is the one being offered, or nothing is serving', async () => {
  backend(invoke, { share_status: status({ port: 4918 }) });
  page();
  await screen.findByRole('button', { name: english.stopSharing });
  // Same list as the one the service read: nothing has changed, so there is
  // nothing to warn about.
  expect(screen.queryByText(english.shareListChanged)).toBeNull();

  // And nothing is running at all: there is no list being offered, so a list
  // that differs from it is not a fact about anything.
  cleanup();
  backend(invoke, { share_status: status({ listChanged: true }) });
  page();
  await screen.findByRole('button', { name: english.startSharing });
  expect(screen.queryByText(english.shareListChanged)).toBeNull();
});

it('says how many videos on the list a client will not be offered', async () => {
  backend(invoke, { share_status: status({ port: 4918, missingFiles: 2 }) });
  page();
  // The count and not the names: what the user needs to know is that the
  // television will show fewer than they picked. Said only while something is
  // serving, because it is about what a client is being offered.
  expect(
    await screen.findByText(
      english.shareMissingFiles_other.replace('{{countText}}', '2'),
    ),
  ).toBeTruthy();
});

it('shows the address the service is really on, and copies it', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  setClipboard(writeText);
  backend(invoke, {
    // A port other than the one the service asks for, which is what the
    // interface has to be able to show: the address it offers is the one that
    // works, and 4918 is what was wanted rather than what was taken.
    share_status: status({ port: 4919, addresses: [address()] }),
  });
  page();
  // The address and the port together, in the spelling a client is given: the
  // trailing slash is how the protocol says this is a collection to browse.
  const url = 'http://192.168.1.5:4919/';
  expect(await screen.findByText(url)).toBeTruthy();
  expect(
    screen.getByText(english.sharingOn.replace('{{port}}', '4919')),
  ).toBeTruthy();
  // The interface name is what tells two plausible-looking addresses apart on a
  // machine with a virtual adapter.
  expect(screen.getByText('Wi-Fi')).toBeTruthy();

  fireEvent.click(
    screen.getByRole('button', { name: `${english.copyAddress}: ${url}` }),
  );
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
  expect(notices.setError).not.toHaveBeenCalled();
});

it('marks the address that cannot reach a television', async () => {
  backend(invoke, {
    share_status: status({
      port: 4918,
      addresses: [
        address(),
        address({
          interface: 'Loopback',
          address: '127.0.0.1',
          loopback: true,
        }),
      ],
    }),
  });
  page();
  const rows = await screen.findAllByRole('listitem');
  // The order is the backend's, and the mark is on the last row: the machine
  // talking to itself, which a user copying down the list would be most likely
  // to take by mistake.
  expect(rows[0].textContent).toContain('192.168.1.5');
  expect(rows[0].textContent).not.toContain(english.addressLoopback);
  expect(rows[1].textContent).toContain('http://127.0.0.1:4918/');
  expect(rows[1].textContent).toContain(english.addressLoopback);
});

it('says what to do instead of showing addresses while nothing is running', async () => {
  backend(invoke, { share_status: status({ addresses: [address()] }) });
  page();
  // Nothing is running, so there is no port to put on an address: the block
  // explains itself rather than listing addresses that lead nowhere.
  expect(await screen.findByText(english.connectionIdle)).toBeTruthy();
  expect(screen.queryByText('http://192.168.1.5:4918/')).toBeNull();
  // And the credentials are there anyway, which is the reason the block is
  // drawn at all in this state: a user can set the television up first.
  expect(screen.getByText('enjoy')).toBeTruthy();
});

it('says so when the machine has no address to offer', async () => {
  backend(invoke, { share_status: status({ port: 4918, addresses: [] }) });
  page();
  // Every adapter down: a heading with nothing under it is the one thing this
  // block must not be.
  expect(await screen.findByText(english.connectionNoAddress)).toBeTruthy();
});

it('lists the devices that have asked for something, and how long ago', async () => {
  backend(invoke, {
    share_status: status({
      port: 4918,
      // In the order the backend hands them over, most recently heard from
      // first: the page draws the list rather than sorting it, and the sort is
      // the backend's — it is the one that knows when each request arrived.
      devices: [
        device({ address: '192.168.1.31', name: null, lastSeen: Date.now() }),
        device({ lastSeen: Date.now() - 12_000 }),
      ],
    }),
  });
  page();
  // The name the client gave, the address it came from, and the moment it was
  // last heard from. The list is most-recent-first, so the client that has just
  // been here is the row above the one that has been quiet for twelve seconds.
  const rows = await screen.findAllByRole('listitem');
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toContain('192.168.1.31');
  // A second and not two: the singular is what the backend's own answer of
  // "just now" reads as, and it is the only count that has a form of its own.
  expect(rows[0].textContent).toContain(
    english.activeAgo_one.replace('{{countText}}', '1'),
  );
  expect(rows[1].textContent).toContain('Infuse/7.6.4');
  expect(rows[1].textContent).toContain('192.168.1.24');
  expect(rows[1].textContent).toContain(
    english.activeAgo_other.replace('{{countText}}', '12'),
  );
  // A client that did not name itself is still a row, under the word for not
  // knowing: a blank there would read as a device that failed to arrive.
  expect(rows[0].textContent).toContain(english.unknown);
});

it('says the list is empty when no device has asked', async () => {
  backend(invoke, { share_status: status({ port: 4918 }) });
  page();
  // The wording and not just the absence: the list is drawn only while the
  // service is running, so an empty one is a fact about the last minute rather
  // than a section that has not loaded.
  expect(await screen.findByText(english.devicesEmpty)).toBeTruthy();
  expect(screen.getByText(english.devicesHelp)).toBeTruthy();
});

it('reads the list again on its own, so a device appears and drops off', async () => {
  // The criterion is that neither arrival nor departure needs the user to do
  // anything, and the only way to see that is to run the clock: nothing pushes
  // either event, so what the page does with a quiet five seconds is the whole
  // of the feature.
  vi.useFakeTimers();
  let answer = status({ port: 4918 });
  vi.mocked(invoke).mockImplementation((async (command: string) => {
    if (command === 'share_status') return answer;
    throw { code: 'app.unexpected', errorId: 'test' };
  }) as never);
  page();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText(english.devicesEmpty)).toBeTruthy();

  // A device that was not there a moment ago, and the page hears about it
  // without anyone touching it.
  answer = status({ port: 4918, devices: [device()] });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(screen.getByText('Infuse/7.6.4')).toBeTruthy();
  expect(screen.queryByText(english.devicesEmpty)).toBeNull();

  // And gone again once the backend stops counting it among the recent.
  answer = status({ port: 4918 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(screen.getByText(english.devicesEmpty)).toBeTruthy();
});
