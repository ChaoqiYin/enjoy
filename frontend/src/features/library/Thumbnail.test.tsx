import { cleanup, render } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Video } from '../../shared/api';
import { Thumbnail } from './Thumbnail';
import english from '../../../../shared/locales/en/common.json';
import errors from '../../../../shared/locales/en/errors.json';

// Which picture a video has is one decision, and this component is where it is
// taken: the card, the compact row and the details panel all draw a picture by
// drawing this, so the three cannot answer differently. The two answers are a
// cover a plugin found and the frame the media pass made, and the order between
// them is the whole of what this file holds.

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn(),
  isTauri: () => true,
}));

const i18n = createInstance();
beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english, errors } },
  });
});
afterEach(cleanup);

const record = (overrides: Partial<Video> = {}): Video => ({
  id: 7,
  path: '/movies/example.mp4',
  file_name: 'example.mp4',
  folder_path: '/movies',
  file_size: 1024,
  modified_at: 0,
  duration_ms: 65000,
  width: 1920,
  height: 1080,
  codec: 'h264',
  thumbnail_path: '/thumbnails/7.jpg',
  cover_path: null,
  favorite: false,
  shared: false,
  play_count: 0,
  last_played_at: null,
  created_at: 0,
  updated_at: 0,
  ...overrides,
});

function drawn(video: Video): HTMLImageElement | null {
  const { container } = render(
    <I18nextProvider i18n={i18n}>
      <Thumbnail video={video} />
    </I18nextProvider>,
  );
  return container.querySelector('img');
}

it('draws the cover a plugin found, over the frame the media pass made', () => {
  // Both are there, which is the state every record a plugin has been asked
  // about is in: the frame was written on the media pass's way past and is not
  // removed by a cover arriving. The cover wins because the user asked a plugin
  // for *this* video, and the frame is what was there before they did.
  const picture = drawn(record({ cover_path: '/covers/7.jpg' }));
  expect(picture?.getAttribute('src')).toBe('asset://localhost//covers/7.jpg');
});

it('draws the media pass’s frame when no plugin has found a cover', () => {
  // The other way round, and it is not the same test read backwards: an answer
  // that always drew the cover would pass the one above and put a broken
  // picture on every record no plugin has anything to say about.
  const picture = drawn(record());
  expect(picture?.getAttribute('src')).toBe(
    'asset://localhost//thumbnails/7.jpg',
  );
});
