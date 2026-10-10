// First, deliberately: the standing-in slices below are in hand before a mocked
// module is first asked for. Everything after this line is imported through the
// modules they stand in for.
import {
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
 * The listing itself: how much the library holds, the records of the page being
 * read, the shape they are drawn in, and the footer that reaches the rest of it.
 *
 * The panel a card opens is the board's and is beside it (`useVideoBoard.test`):
 * the two are the same page mounted differently, and what each file is about is
 * what a failure in it would say.
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
});

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
    index: listing.index,
    turnTo: options.turnTo ?? (() => {}),
    filtered: options.filtered ?? false,
    clearFilters: options.clearFilters ?? (() => {}),
    toolbarProps: { viewMode },
  } as unknown as ReturnType<typeof useVideoPageView>;
  return (
    <I18nextProvider i18n={i18n}>
      {/* The page is drawn inside a route because it is drawn inside one in the
          application, and the board behind the cards asks the route which
          listing this is. */}
      <MemoryRouter>
        <VideoPageContent
          view={view}
          listLabel={english.library}
          emptyTitle={options.emptyTitle ?? ''}
          emptyHelp={options.emptyHelp ?? ''}
          onAdd={options.onAdd}
        />
      </MemoryRouter>
    </I18nextProvider>
  );
}

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
  listing.index = 1;
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
  expect(screen.queryByRole('navigation')).toBeNull();
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

it('draws a page it is still putting right as loading, not as an empty library', () => {
  // A rescan shortened the list and the page the user was standing on is gone:
  // the answer holds no records, but the library is not empty. Read as "the
  // library is empty" it would say something false about a library that has
  // thirty records in it. The page is being put back on the last page that
  // exists (`useLibrary` clamps the index), and until that answer arrives this
  // is a page being read rather than a state the library is in.
  listing.index = 2;
  collection.videos.data = { items: [], total: 30 };
  render(
    page({
      emptyTitle: english.empty,
      emptyHelp: english.welcome,
      onAdd: () => {},
    }),
  );
  expect(screen.getByText(english.loading)).toBeTruthy();
  expect(screen.queryByRole('heading', { name: english.empty })).toBeNull();
  expect(screen.queryByText(english.welcome)).toBeNull();
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
