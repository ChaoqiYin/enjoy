import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Video } from '../../shared/api';
import { VideoDetails } from './VideoDetails';
import english from '../../../../shared/locales/en/common.json';
import errors from '../../../../shared/locales/en/errors.json';

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
const actions = () => ({
  details: vi.fn(),
  play: vi.fn(),
  favorite: vi.fn(),
  reveal: vi.fn(),
  remove: vi.fn(),
  copyPath: vi.fn(),
  regenerate: vi.fn(),
  refreshInfo: vi.fn(),
});
beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english, errors } },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function view(handlers = actions(), busy = false, source = video) {
  return (
    <I18nextProvider i18n={i18n}>
      <VideoDetails video={source} actions={handlers} busy={busy} />
    </I18nextProvider>
  );
}
it('shows the indexed path without the verbatim prefix it carries', () => {
  render(
    view(actions(), false, {
      ...video,
      path: '\\\\?\\E:\\movies\\example.mp4',
    }),
  );
  expect(screen.getByText('E:\\movies\\example.mp4')).toBeTruthy();
});
it('reports maintenance failure and retries without losing existing details', async () => {
  const handlers = actions();
  handlers.refreshInfo
    .mockRejectedValueOnce(new Error('failed'))
    .mockResolvedValue(undefined);
  render(view(handlers));
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: english.refreshInfo })),
  );
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText('example.mp4')).toBeTruthy();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: english.retry })),
  );
  expect(handlers.refreshInfo).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});
