import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { libraryApi } from '../../shared/api';
import type { Video, VideoField } from '../../shared/api';
import { SpaceProvider } from '../space/SpaceProvider';
import { useVideoFields } from './useVideoFields';

/**
 * When the panel's plugin fields are asked for, and what the panel is drawn from
 * while the answer is not in hand.
 *
 * The rule the drawer depends on is the one in the middle: opening a video asks
 * for its fields again. The fields are what the plugins said the last time
 * anyone asked, and a panel that read a cached answer would show the record as
 * it was the first time it was opened — which is the one thing a plugin-written
 * field cannot be, since the whole point of asking is that a plugin may have run
 * since.
 */

const video: Video = {
  id: 7,
  path: '/movies/example.mp4',
  file_name: 'example.mp4',
  folder_path: '/movies',
  file_size: 1024,
  modified_at: 0,
  duration_ms: null,
  width: null,
  height: null,
  codec: null,
  thumbnail_path: null,
  favorite: false,
  shared: false,
  play_count: 0,
  last_played_at: null,
  created_at: 0,
  updated_at: 0,
};
const other: Video = { ...video, id: 8, path: '/movies/other.mp4' };
const written: VideoField[] = [
  { key: 'cover', value: '/covers/7.jpg', source_plugin: 'cover-fetcher' },
];
const space = { id: 1, name: 'Library' };

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(libraryApi, 'listSpaces').mockResolvedValue([space]);
  vi.spyOn(libraryApi, 'fields').mockResolvedValue(written);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

function mount(video: Video | null) {
  return renderHook(
    ({ open }: { open: Video | null }) => useVideoFields(open),
    {
      initialProps: { open: video },
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(
          QueryClientProvider,
          { client },
          createElement(SpaceProvider, { initialSpace: space, children }),
        ),
    },
  );
}

it('asks for the fields of the video that is open, in the space on screen', async () => {
  const { result } = mount(video);
  await waitFor(() =>
    expect(vi.mocked(libraryApi.fields)).toHaveBeenCalledWith(
      space.id,
      video.path,
    ),
  );
  await waitFor(() => expect(result.current).toEqual(written));
});

it('asks for nothing while no video is open', () => {
  mount(null);
  // The drawer is mounted for as long as the page is — it is closed, not
  // removed — so the question has to be the open state's and not the mount's.
  // Asking here would be a plugin call every time a list page rendered.
  expect(vi.mocked(libraryApi.fields)).not.toHaveBeenCalled();
});

it('asks again when the same video is opened a second time', async () => {
  const { rerender } = mount(video);
  await waitFor(() =>
    expect(vi.mocked(libraryApi.fields)).toHaveBeenCalledTimes(1),
  );
  rerender({ open: null });
  rerender({ open: video });
  // A plugin may have run while the drawer was shut — the refresh is what asks
  // them — so the second open is a new question rather than the same one read
  // out of the cache again.
  await waitFor(() =>
    expect(vi.mocked(libraryApi.fields)).toHaveBeenCalledTimes(2),
  );
});

it('asks about the video that is open rather than the one before it', async () => {
  const { result, rerender } = mount(video);
  await waitFor(() => expect(result.current).toEqual(written));
  rerender({ open: other });
  await waitFor(() =>
    expect(vi.mocked(libraryApi.fields)).toHaveBeenLastCalledWith(
      space.id,
      other.path,
    ),
  );
});

it('draws no field at all while the answer is in hand or never comes', async () => {
  vi.mocked(libraryApi.fields).mockRejectedValue({
    code: 'media.file.not_found',
    params: {},
    errorId: 'err_fields',
  });
  const { result } = mount(video);
  // Nothing to draw and nothing to draw it with: the panel is a list of terms,
  // and a failure here is either a record that is gone — which the drawer reads
  // off the list and acts on itself — or a library that is not answering, which
  // is reported by the same notice every other failing query goes to. What the
  // panel must not do is stop being drawn.
  await waitFor(() => expect(vi.mocked(libraryApi.fields)).toHaveBeenCalled());
  expect(result.current).toEqual([]);
});
