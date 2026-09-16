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

const { library } = vi.hoisted(() => {
  const library = {
    videos: { data: [] as Video[], isPending: false },
    scan: { data: undefined as ScanStatus | undefined },
    busy: false,
    run: vi.fn(async () => {}),
    setError: vi.fn(),
  };
  return { library };
});

vi.mock('./LibraryProvider', () => ({
  useLibraryContext: () => library,
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
  library.videos.data = [video];
  library.videos.isPending = false;
  library.scan.data = undefined;
  library.busy = false;
  library.run.mockReset();
  library.setError.mockReset();
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

it('shows the copied indicator when copying the path succeeds', async () => {
  setClipboard(vi.fn().mockResolvedValue(undefined));
  render(page());
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  fireEvent.click(screen.getByRole('button', { name: english.copyPath }));
  await waitFor(() => expect(screen.getByText(english.copied)).toBeTruthy());
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
  expect(screen.queryByText(english.copied)).toBeNull();
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
  expect(screen.queryByRole('dialog')).toBeNull();
});
