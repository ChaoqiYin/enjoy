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
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Video } from '../../shared/api';
import { VideoPageContent } from './VideoPageContent';
import type { useVideoPageView } from './useVideoPageView';
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

vi.mock('./VirtualVideos', () => ({
  VirtualVideos: (props: {
    videos: Video[];
    actions: { details: (video: Video) => void };
  }) => (
    <div>
      {props.videos.map((item) => (
        <button key={item.id} onClick={() => props.actions.details(item)}>
          {item.file_name}
        </button>
      ))}
    </div>
  ),
}));

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  space.id = 1;
  collection.videos.data = [video];
  collection.videos.isPending = false;
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

function page() {
  const view = {
    collectionKey: 'all',
    videos: collection.videos.data ?? [],
    filtered: false,
    clearFilters: () => {},
  } as unknown as ReturnType<typeof useVideoPageView>;
  return (
    <I18nextProvider i18n={i18n}>
      <VideoPageContent view={view} emptyTitle="" emptyHelp="" />
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
  collection.videos.data = [
    { ...video, path: '\\\\?\\E:\\movies\\example.mp4' },
  ];
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
  fireEvent.click(screen.getByRole('button', { name: english.play }));
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
  collection.videos.data = [];
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
