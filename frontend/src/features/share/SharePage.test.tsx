// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import {
  backend,
  busy,
  library,
  notices,
  resetSharePage,
  scan,
  setClipboard,
  status,
  videoActions,
} from '../../test/sharePage';
import { address, device, video } from '../../test/fixtures';
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
import { listen } from '@tauri-apps/api/event';
import { ShareProvider } from './ShareProvider';
import { SharePage } from '../../pages/SharePage';
import english from '../../../../shared/locales/en/common.json';
import errors from '../../../../shared/locales/en/errors.json';

/**
 * The page itself: which command each press sends, what it hands the blocks, and
 * the two things no block can own — what the 共享清单 is, and what a copy that
 * did not work is reported as.
 *
 * The blocks' own answers are theirs and are tested beside them
 * (`ConnectionDetails.test.tsx`, `PasswordDetails.test.tsx`,
 * `DeviceList.test.tsx`, `ListWarnings.test.tsx`), each with only the facts it
 * draws. What is left here needs the whole page standing up: the sharing state,
 * the library's slices, and the backend it talks to.
 */
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  convertFileSrc: (path: string) => path,
}));
// The sharing state subscribes to the close question for the life of the
// interface, which is a subscription this file has to answer for the provider
// to mount at all. What the message says belongs to the provider's own file.
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
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

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms a call and grows with the size of the page; floating-ui asks
// every ancestor of a floating panel that one question, so opening the cards'
// menu on a page this size spends the whole test's time in it. Nothing here is a
// top-layer element, so answering `false` outright is both correct and instant.
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english, errors } },
  });
  resetSharePage(invoke, listen);
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
  // Starting is the one emphatic action on this page, so it is the one the
  // drawing gives its brand colour to. Asked of the variant rather than of a
  // class, which is the visual language and changes when it does.
  expect(start.getAttribute('data-variant')).toBe('primary');
  fireEvent.click(start);

  // The space travels with the command: the backend offers one space's 共享清单
  // and cannot know which one is on screen.
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('open_share', { spaceId: 7 }),
  );
  // The state follows the answer, not the request: the button turns into the
  // one that ends the service only once the backend has said one is running.
  const stop = await screen.findByRole('button', {
    name: english.stopSharing,
  });
  // Ending is a close, and nothing is being undone or thrown away by it, so it
  // is not given the page's own colour: the two directions are two things.
  expect(stop.getAttribute('data-variant')).toBe('secondary');
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

it('does not confuse a service that is up with a list that has something on it', async () => {
  // Two facts that look alike and are not: whether anything is listening, and
  // whether there is anything on the list for it to offer. A service can be up
  // over an empty list — the user has just taken the last video off it — and
  // the page has to be able to say both at once rather than pick one.
  library.videos.data = { items: [], total: 0 };
  backend(invoke, { share_status: status({ port: 4918 }) });
  page();
  expect(
    await screen.findByText(english.sharingOn.replace('{{port}}', '4918')),
  ).toBeTruthy();
  expect(screen.getByText(english.shareListEmpty)).toBeTruthy();
  // And the button still ends the service it can see running: an empty list is
  // not a reason to offer to start one that is already up.
  expect(
    screen.getByRole('button', { name: english.stopSharing }),
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
  // What the backend answers for the 共享清单 when nothing is on it: no records,
  // and a count of none.
  library.videos.data = { items: [], total: 0 };
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
  library.videos.data = {
    items: [video({ shared: true })],
    total: 1,
  };
  page();
  expect(
    (
      await screen.findByRole('button', { name: english.startSharing })
    ).hasAttribute('disabled'),
  ).toBe(false);
  expect(screen.queryByText(english.shareListEmpty)).toBeNull();
});

it('shows the page of records the list answered with, and how many there are', async () => {
  // The records on this page, and how many the whole 清单 holds. That only these
  // two are marked as shared is the listing's doing, not this page's: /share is
  // asked for the shared records (`only: 'shared'`), so a record that is not one
  // of them is a record this page was never handed.
  library.videos.data = {
    items: [
      video({ shared: true, id: 1, file_name: 'first.mp4' }),
      video({ shared: true, id: 2, file_name: 'second.mp4' }),
    ],
    total: 2,
  };
  backend(invoke, { share_status: status() });
  page();
  // The heading, then the count, then the cards themselves: what is drawn here
  // is the backend's answer about the 共享清单.
  expect(
    await screen.findByRole('heading', { name: english.shareListTitle }),
  ).toBeTruthy();
  expect(
    screen.getByText(english.videoCount.replace('{{countText}}', '2')),
  ).toBeTruthy();
  expect(screen.getByText('first.mp4')).toBeTruthy();
  expect(screen.getByText('second.mp4')).toBeTruthy();
});

it('offers the rest of the 共享清单 when there is more of it than this page', async () => {
  library.videos.data = {
    items: [video({ shared: true, id: 1, file_name: 'first.mp4' })],
    // A list longer than one page, of which this is the first.
    total: 48,
  };
  backend(invoke, { share_status: status() });
  page();
  expect(
    await screen.findByText(
      english.videoRange
        .replace('{{fromText}}', '1')
        .replace('{{toText}}', '24'),
    ),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: english.nextPage })).toBeTruthy();
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

it('hands the backend’s answer about the list to the warnings', async () => {
  // What each warning is worth saying for is the warnings' own business, and
  // tested there. What is the page's is the wiring: the facts the backend
  // answered are the facts the warnings are given.
  backend(invoke, {
    share_status: status({ port: 4918, listChanged: true, missingFiles: 1 }),
  });
  page();
  expect(await screen.findByText(english.shareListChanged)).toBeTruthy();
  expect(
    screen.getByText(
      english.shareMissingFiles_one.replace('{{countText}}', '1'),
    ),
  ).toBeTruthy();
});

it('copies what a block hands it, and says so', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  setClipboard(writeText);
  backend(invoke, {
    share_status: status({ port: 4919, addresses: [address()] }),
  });
  page();
  // The pasteboard is the page's to reach for, because it is the page that knows
  // what a copy that failed is reported as — the block only says what it would
  // like copied.
  const url = 'http://192.168.1.5:4919/';
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${english.copyAddress}: ${url}`,
    }),
  );
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
  expect(notices.showCopyHint).toHaveBeenCalled();
  expect(notices.setError).not.toHaveBeenCalled();
});

it('reports a copy that could not be made, rather than doing nothing', async () => {
  // No pasteboard at all, which is what a browser without the permission hands
  // back. A press that quietly did nothing is the failure this exists for.
  setClipboard();
  backend(invoke, {
    share_status: status({ port: 4919, addresses: [address()] }),
  });
  page();
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${english.copyAddress}: http://192.168.1.5:4919/`,
    }),
  );
  await waitFor(() =>
    expect(notices.setError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'app.clipboard.failed' }),
    ),
  );
});

it('regenerates the password, and shows what the backend answered', async () => {
  backend(invoke, {
    share_status: status({ port: 4918, password: 'clipper12345' }),
    // What the backend answers after the press: a new password, and a service
    // that is still checking the old one.
    regenerate_share_password: status({
      port: 4918,
      password: 'doubloons6789',
      needsRestart: true,
    }),
  });
  page();
  fireEvent.click(
    await screen.findByRole('button', { name: english.regeneratePassword }),
  );
  // The space travels with it like every other space-scoped call: the answer is
  // the whole status, and part of that status is whether the running service is
  // still offering the list that space holds now.
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('regenerate_share_password', {
      spaceId: 7,
    }),
  );
  // The new password is shown at once — it is the one the user needs after they
  // do what the warning says — and the warning is what tells them the running
  // service does not take it yet.
  expect(await screen.findByText(english.passwordRestartNeeded)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: english.showPassword }));
  expect(screen.getByText('doubloons6789')).toBeTruthy();
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
