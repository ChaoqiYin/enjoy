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
import type { ScanStatus, Video } from '../../shared/api';
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

const { library, space } = vi.hoisted(() => {
  const library = {
    videos: { data: [] as Video[], isPending: false },
    scan: { data: undefined as ScanStatus | undefined },
    busy: false,
    setError: vi.fn(),
    copyHint: false,
    showCopyHint: vi.fn(),
    dismissCopyHint: vi.fn(),
    lastPlayedId: null as number | null,
    play: vi.fn(),
    toggleFavorite: vi.fn(),
    reveal: vi.fn(),
    removeVideo: vi.fn(),
    regenerateThumbnail: vi.fn(),
    refreshInfo: vi.fn(),
  };
  return { library, space: { id: 1, name: 'Library' } };
});

vi.mock('./LibraryProvider', () => ({
  useLibraryContext: () => library,
}));

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
  library.videos.data = [video];
  library.videos.isPending = false;
  library.scan.data = undefined;
  library.busy = false;
  library.setError.mockReset();
  library.showCopyHint.mockReset();
  // What each action does with its argument is the library's business and is
  // covered where the library is; here they only have to be observable.
  for (const action of [
    library.play,
    library.toggleFavorite,
    library.reveal,
    library.removeVideo,
    library.regenerateThumbnail,
    library.refreshInfo,
  ])
    action.mockReset();
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
    videos: library.videos.data ?? [],
    search: '',
    folder: '',
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
  library.videos.data = [{ ...video, path: '\\\\?\\E:\\movies\\example.mp4' }];
  render(page());
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  expect(screen.getByText('E:\\movies\\example.mp4')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: english.copyPath }));
  await waitFor(() => expect(library.showCopyHint).toHaveBeenCalledOnce());
  expect(writeText).toHaveBeenCalledWith('E:\\movies\\example.mp4');
  expect(library.setError).not.toHaveBeenCalled();
});

it('surfaces a notification when copying the path fails', async () => {
  setClipboard();
  render(page());
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  fireEvent.click(screen.getByRole('button', { name: english.copyPath }));
  await waitFor(() =>
    expect(library.setError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'app.clipboard.failed' }),
    ),
  );
  expect(library.showCopyHint).not.toHaveBeenCalled();
});

// What a launch does to the record and the marker is the library's rule and is
// covered beside the library; the page's job is to name the video, not to carry
// the command.
it('asks the library to play the video the click landed on', () => {
  render(page());
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  fireEvent.click(screen.getByRole('button', { name: english.play }));
  expect(library.play).toHaveBeenCalledWith(video);
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
  library.videos.data = [];
  rerender(page());
  await waitFor(() =>
    expect(library.setError).toHaveBeenCalledWith(
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
