// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import * as doubles from '../../test/doubles';
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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Video } from '../../shared/api';
import { VideoPageContent } from './VideoPageContent';
import type { useVideoPageView } from './useVideoPageView';
import type { ViewMode } from './listing';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();
const video: Video = {
  id: 1,
  path: '/movies/example.mp4',
  file_name: 'example.mp4',
  folder_path: '/movies',
  file_size: 1024,
  modified_at: 0,
  duration_ms: 65000,
  width: 1920,
  height: 1080,
  codec: 'h264',
  thumbnail_path: null,
  favorite: false,
  shared: false,
  play_count: 3,
  last_played_at: 10,
  created_at: 0,
  updated_at: 0,
};

// One double per module the page reads, built from that module's own declared
// type rather than written out here: the page reads five of them — the
// collection, the scan, the in-flight counter, the notices, and what can be
// asked of a video — and a key one of those slices grows is a compile error in
// `doubles`, not a test that quietly goes on passing.
//
// The functions under test are handed in as the test's own mocks, so what the
// page did with them is observable without reaching through the interface for
// it: a slice's type says a function is a function, which is all a caller needs
// to know and not enough for an assertion.
const setError = vi.fn();
const showCopyHint = vi.fn();
const actionMocks = {
  play: vi.fn(),
  toggleFavorite: vi.fn(),
  toggleShared: vi.fn(),
  reveal: vi.fn(),
  removeVideo: vi.fn(),
  regenerateThumbnail: vi.fn(),
  refreshInfo: vi.fn(),
};
const collection = doubles.videos();
const scan = doubles.scan();
const notices = doubles.notices({ setError, showCopyHint });
const videoActions = doubles.videoActions(actionMocks);
const busy = doubles.busy();
const space = doubles.space({ name: 'Library' });

vi.mock('./useVideos', () => ({ useVideos: () => collection }));
vi.mock('./useScan', () => ({ useScan: () => scan }));
vi.mock('./useNotices', () => ({ useNotices: () => notices }));
vi.mock('./useVideoActions', () => ({ useVideoActions: () => videoActions }));
vi.mock('./useBusy', () => ({ useBusy: () => busy }));

vi.mock('../space/SpaceProvider', () => ({
  useSpace: () => space,
}));

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms a call and grows with the size of the page; floating-ui asks
// every ancestor of a floating panel that one question, so opening a card's menu
// spends the whole test's time in it. Nothing here is a top-layer element, so
// answering `false` outright is both correct and instant (界面迁移的已知坑 §4).
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  space.id = 1;
  collection.videos.data = { items: [video], total: 1 };
  collection.videos.isPending = false;
  collection.pageKey = 'library page 1';
  pageIndex = 0;
  scan.status = undefined;
  busy.busy = false;
  setError.mockReset();
  showCopyHint.mockReset();
  // What each action does with its argument is the library's business and is
  // covered where the library is; here they only have to be observable.
  for (const action of Object.values(actionMocks)) action.mockReset();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window.navigator as { clipboard?: unknown }).clipboard;
});

// Which page of the list the view says it is drawing, and the page identity the
// slice is answering from: the two move together when the user turns a page, and
// a test that turns one turns both.
let pageIndex = 0;

function page(
  options: {
    turnTo?: (index: number) => void;
    emptyTitle?: string;
    emptyHelp?: string;
    onAdd?: () => void;
    filtered?: boolean;
    clearFilters?: () => void;
    viewMode?: ViewMode;
  } = {},
) {
  // The shape the page is drawn in arrives on the same props bag the toolbar is
  // handed (`useVideoPageView`): the switch and the board read one value.
  const viewMode = options.viewMode ?? 'grid';
  const view = {
    collectionKey: collection.pageKey,
    videos: collection.videos.data?.items ?? [],
    total: collection.videos.data?.total ?? 0,
    index: pageIndex,
    turnTo: options.turnTo ?? (() => {}),
    filtered: options.filtered ?? false,
    clearFilters: options.clearFilters ?? (() => {}),
    toolbarProps: { viewMode },
  } as unknown as ReturnType<typeof useVideoPageView>;
  return (
    <I18nextProvider i18n={i18n}>
      <VideoPageContent
        view={view}
        listLabel={english.library}
        emptyTitle={options.emptyTitle ?? ''}
        emptyHelp={options.emptyHelp ?? ''}
        onAdd={options.onAdd}
      />
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
  expect(videoActions.play).toHaveBeenCalledWith(video);
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
  pageIndex = 1;
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
  pageIndex = 1;
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

it('says how much the library holds, not how much this page holds', () => {
  collection.videos.data = { items: [video, { ...video, id: 2 }], total: 36 };
  const { container } = render(page());
  // The page holds one page of a list (ADR 0016), so the count over it is about
  // the whole library — the backend's answer, and the drawing `_2`'s 「共 36 个视频」.
  // It is drawn whether or not there is another page, because it is a statement
  // about the list rather than a control.
  const count = screen.getByText(
    english.videoCount.replace('{{countText}}', '36'),
  );
  expect(count).toBeTruthy();
  // And it is drawn above the list rather than in it: the number of records is
  // not one of them, so it must not scroll away with the cards it counts.
  const viewport = container.querySelector<HTMLElement>('.scroll-viewport')!;
  expect(viewport.contains(count)).toBe(false);
});

it('says nothing about a count it has not been told yet', () => {
  collection.videos.isPending = true;
  render(page());
  expect(screen.getByText(english.loading)).toBeTruthy();
  expect(
    screen.queryByText(english.videoCount.replace('{{countText}}', '1')),
  ).toBeNull();
});

it('draws the records in the shape the page says it is in, and only that one', () => {
  collection.videos.data = { items: [video, { ...video, id: 2 }], total: 2 };
  const { container, rerender } = render(page({ viewMode: 'grid' }));
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(container.querySelector('table')).toBeNull();

  rerender(page({ viewMode: 'list' }));
  expect(container.querySelectorAll('article')).toHaveLength(0);
  expect(container.querySelector('table')).toBeNull();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);

  rerender(page({ viewMode: 'table' }));
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  expect(container.querySelectorAll('article')).toHaveLength(0);
  expect(screen.getByRole('table')).toBeTruthy();
});

it('gives the room a hover needs to the viewport that clips, not to the grid', () => {
  const { container } = render(page());
  // The room the first row's and first column's hover paints into is the clip's
  // to give: an `overflow` box clips at its padding box, and a descendant's
  // negative start margin is the one thing such a box cannot scroll to, so room
  // kept by the grid was room spent outside the glass (ADR 0008,
  // `videoCardBox.hoverRoomStyle`). jsdom lays nothing out, so what this proves
  // is where the room was put; that it is enough is the browser's measurement.
  const viewport = container.querySelector<HTMLElement>('.scroll-viewport')!;
  expect(viewport.style.paddingInlineStart).toBe('10px');
  expect(viewport.style.marginInlineStart).toBe('-10px');
  expect(
    container.querySelector('.grid')?.getAttribute('style') ?? '',
  ).not.toContain('padding');
});

it('mounts the next page afresh, so it is read from its top', () => {
  const { container, rerender } = render(page());
  const before = container.querySelector('.scroll-viewport');
  // A page the user has turned to is read from its beginning, not from wherever
  // the last one was scrolled to. jsdom implements no scrolling, so what is
  // asserted is the mechanism that does it there: the list is mounted again.
  pageIndex = 1;
  collection.pageKey = 'library page 2';
  rerender(page());
  expect(container.querySelector('.scroll-viewport')).not.toBe(before);
});

it('closes the menu a scroll leaves behind', async () => {
  const { container } = render(page());
  const card = screen.getByText(video.file_name).closest('article')!;
  fireEvent.contextMenu(card, { clientX: 10, clientY: 20 });
  expect(
    await screen.findByRole('menuitem', { name: english.play }),
  ).toBeTruthy();
  // The menu is anchored where the pointer asked, and a list that has moved
  // under it leaves it pointing at nothing.
  fireEvent.scroll(container.querySelector('.scroll-viewport')!);
  await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
});

it('offers the rest of the list when it runs past this page', () => {
  const turnTo = vi.fn();
  collection.videos.data = { items: [video], total: 60 };
  render(page({ turnTo }));
  expect(screen.getByText('Showing 1–24 of 60')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // The footer asks in pages and the library counts in indices (see
  // `features/library/Pagination`), so the second page is index 1.
  expect(turnTo).toHaveBeenCalledWith(1);
});

it('offers nowhere to go in a list that fits on one page', () => {
  collection.videos.data = { items: [video], total: 24 };
  render(page());
  // A footer with one page in it is furniture, and the count above already says
  // how much there is.
  expect(screen.queryByText(/^Showing/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
});

it('says a filter found nothing, and offers the way back to everything', () => {
  const clearFilters = vi.fn();
  collection.videos.data = { items: [], total: 0 };
  render(page({ filtered: true, clearFilters }));
  // "Nothing matched" rather than "nothing here": the difference between the two
  // is the difference between the user narrowing the list and the library being
  // empty, and it is the one thing the list needs the filters for.
  expect(screen.getByRole('heading', { name: english.noMatch })).toBeTruthy();
  expect(screen.getByText(english.noMatchHelp)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: english.clear }));
  expect(clearFilters).toHaveBeenCalledOnce();
});

it('welcomes an empty library and says how to start it', () => {
  const onAdd = vi.fn();
  collection.videos.data = { items: [], total: 0 };
  render(
    page({
      emptyTitle: english.empty,
      emptyHelp: english.welcome,
      onAdd,
    }),
  );
  expect(screen.getByRole('heading', { name: english.empty })).toBeTruthy();
  expect(screen.getByText(english.welcome)).toBeTruthy();
  // The formats are worth saying here and only here: this is the moment the user
  // is wondering whether their files count as videos at all (drawing `_7`).
  expect(screen.getByText(english.welcomeFormats)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: english.add }));
  expect(onAdd).toHaveBeenCalledOnce();
});
