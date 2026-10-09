// First, deliberately: the standing-in slices below are in hand before a mocked
// module is first asked for. Everything after this line is imported through the
// modules they stand in for.
import {
  actionMocks,
  busy,
  collection,
  listing,
  notices,
  resetVideoPage,
  scan,
  space,
  video,
  videoActions,
} from '../../test/videoPage';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoPageContent } from './VideoPageContent';
import type { useVideoPageView } from './useVideoPageView';
import type { ViewMode } from './listing';
import english from '../../../../shared/locales/en/common.json';

/**
 * The board a page of cards presses into service: what a click on a card opens,
 * what the panel asks the library to do, and when the page closes it again.
 *
 * These are the rules of [`useVideoBoard`] rather than of the page, which is why
 * they are here and the listing's own are beside it: what a right-click menu
 * offers, what the drawer is handed, and — the rule most of them are about —
 * when an open drawer is closed because the record it describes is gone. The
 * cards the click has to land on are the page's, so these mount the page for
 * them; nothing here asserts what the listing looks like.
 */

const i18n = createInstance();

vi.mock('./useVideos', () => ({ useVideos: () => collection }));
vi.mock('./useScan', () => ({ useScan: () => scan }));
vi.mock('./useNotices', () => ({ useNotices: () => notices }));
vi.mock('./useVideoActions', () => ({ useVideoActions: () => videoActions }));
vi.mock('./useBusy', () => ({ useBusy: () => busy }));

vi.mock('../space/SpaceProvider', () => ({
  useSpace: () => space,
}));

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  resetVideoPage();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window.navigator as { clipboard?: unknown }).clipboard;
});

function page(
  options: {
    /** Which listing this is a page of. The route is the answer — every page
     *  declares its own path — and the drawer reads it there to tell a record
     *  that left the library from one the page's own condition dropped. */
    path?: string;
  } = {},
) {
  // The shape the page is drawn in arrives on the same props bag the toolbar is
  // handed (`useVideoPageView`): the switch and the board read one value.
  const view = {
    collectionKey: collection.pageKey,
    videos: collection.videos.data?.items ?? [],
    total: collection.videos.data?.total ?? 0,
    index: listing.index,
    turnTo: () => {},
    filtered: false,
    clearFilters: () => {},
    toolbarProps: { viewMode: 'grid' as ViewMode },
  } as unknown as ReturnType<typeof useVideoPageView>;
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[options.path ?? '/']}>
        <VideoPageContent
          view={view}
          listLabel={english.library}
          emptyTitle=""
          emptyHelp=""
        />
      </MemoryRouter>
    </I18nextProvider>
  );
}

function setClipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

it('copies the path the panel shows, and announces it', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  setClipboard(writeText);
  collection.videos.data = {
    items: [{ ...video, path: '\\\\?\\E:\\movies\\example.mp4' }],
    total: 1,
  };
  render(page());
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  expect(screen.getByText('E:\\movies\\example.mp4')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: english.copyPath }));
  await waitFor(() => expect(notices.showCopyHint).toHaveBeenCalledOnce());
  expect(writeText).toHaveBeenCalledWith('E:\\movies\\example.mp4');
  expect(notices.setError).not.toHaveBeenCalled();
});

it('surfaces a notification when copying the path fails', async () => {
  setClipboard();
  render(page());
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  fireEvent.click(screen.getByRole('button', { name: english.copyPath }));
  await waitFor(() =>
    expect(notices.setError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'app.clipboard.failed' }),
    ),
  );
  expect(notices.showCopyHint).not.toHaveBeenCalled();
});

// What a launch does to the record and the marker is the library's rule and is
// covered beside the library; the page's job is to name the video, not to carry
// the command.
it('asks the library to play the video the click landed on', () => {
  render(page());
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  // The panel's own play, not the card's underneath it: the card draws one too,
  // and the two would be the same name twice over if this asked for either.
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: english.play,
    }),
  );
  expect(actionMocks.play).toHaveBeenCalledWith(video);
});

it('closes what was opened onto the old space when the space changes', async () => {
  const { rerender } = render(page());
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  expect(document.querySelector('[role="dialog"]')?.hasAttribute('inert')).toBe(
    false,
  );
  // The panel is describing a video of the space that was on screen. Another
  // space keeps its own records, so the same path is a different video there
  // and the panel would be describing something that is not in this list.
  space.id = 2;
  rerender(page());
  await waitFor(() =>
    expect(
      document.querySelector('[role="dialog"]')?.hasAttribute('inert'),
    ).toBe(true),
  );
});

it('closes the drawer and notifies when a rescan removes the video', async () => {
  const { rerender } = render(page());
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  // The same list, asked the same question, and now one record shorter: the one
  // the drawer is describing.
  collection.videos.data = { items: [], total: 0 };
  rerender(page());
  await waitFor(() =>
    expect(notices.setError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'media.file.removed' }),
    ),
  );
  // The shell outlives the close, so wait for it to become `inert` rather than
  // to leave the DOM: that attribute is what takes the closed panel out of the
  // tab order and the accessibility tree.
  await waitFor(() =>
    expect(
      document.querySelector('[role="dialog"]')?.hasAttribute('inert'),
    ).toBe(true),
  );
});

it('leaves the open drawer alone when the user turns to the next page', async () => {
  const { rerender } = render(page());
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  // The page that follows holds other records, and holds none of this one: a
  // drawer that read that as "the file was removed" would close every time the
  // user turned a page.
  listing.index = 1;
  collection.pageKey = 'library page 2';
  collection.videos.data = {
    items: [{ ...video, id: 2, file_name: 'second.mp4' }],
    total: 1,
  };
  rerender(page());
  // Effects have already run by the time `rerender` returns, so a notice that
  // was going to be raised has been.
  expect(notices.setError).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')?.hasAttribute('inert')).toBe(
    false,
  );
});

it('does not read a shorter answer to another question as a removal', async () => {
  // Two records here, so the list can get shorter without the drawer's record
  // being the one that left.
  collection.videos.data = {
    items: [video, { ...video, id: 2, file_name: 'second.mp4' }],
    total: 2,
  };
  const { rerender } = render(page());
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  // The user is now reading the second page of a list a rescan has since
  // shortened: the answer is shorter, and this record is not in it. Neither fact
  // is about this record — it is on the page the drawer was opened on, and the
  // shorter list may have dropped it on any page at all.
  listing.index = 1;
  collection.pageKey = 'library page 2';
  collection.videos.data = {
    items: [{ ...video, id: 3, file_name: 'third.mp4' }],
    total: 1,
  };
  rerender(page());
  expect(notices.setError).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')?.hasAttribute('inert')).toBe(
    false,
  );
});

it('does not read a record that moved off the page as a removal', async () => {
  collection.videos.data = {
    items: [video, { ...video, id: 2, file_name: 'second.mp4' }],
    total: 2,
  };
  const { rerender } = render(page());
  fireEvent.click(screen.getByRole('button', { name: 'second.mp4' }));
  // The same list, the same page, the same number of records — read in playing
  // order, as 最近播放页 is, so opening one of them brings it to the front and
  // pushes the last record here back to the next page. The library is no shorter
  // than it was: this record has moved, not gone.
  collection.videos.data = {
    items: [video, { ...video, id: 3, file_name: 'third.mp4' }],
    total: 2,
  };
  rerender(page());
  expect(notices.setError).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')?.hasAttribute('inert')).toBe(
    false,
  );
});

it('does not read a record the user un-favourited as a removal', async () => {
  // 收藏页 is the library under one condition (`only: 'favorite'`), so a record
  // leaves this page the moment the user un-favourites it — and the drawer is
  // exactly where they would do that. The list is shorter and the record is not
  // in it, but the file is still there: reading the user's own answer as a
  // removal would close the drawer and tell them their video was deleted.
  collection.videos.data = {
    items: [
      video,
      { ...video, id: 2, file_name: 'second.mp4', favorite: true },
    ],
    total: 2,
  };
  const { rerender } = render(page({ path: '/favorites' }));
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  // The same list, the same page, asked again: one record shorter, and the one
  // the drawer is describing is the one that left it.
  collection.videos.data = {
    items: [{ ...video, id: 2, file_name: 'second.mp4', favorite: true }],
    total: 1,
  };
  rerender(page({ path: '/favorites' }));
  expect(notices.setError).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')?.hasAttribute('inert')).toBe(
    false,
  );
});
