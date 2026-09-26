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
it('hands a maintenance action the video and reflects that it is running', async () => {
  const handlers = actions();
  let finish!: () => void;
  handlers.refreshInfo.mockImplementation(
    () =>
      new Promise<void>((done) => {
        finish = done;
      }),
  );
  render(view(handlers));
  const button = () =>
    screen.getByRole('button', {
      name: english.refreshInfo,
    }) as HTMLButtonElement;
  fireEvent.click(button());
  expect(handlers.refreshInfo).toHaveBeenCalledWith(video);
  expect(button().disabled).toBe(true);
  await act(async () => finish());
  await waitFor(() => expect(button().disabled).toBe(false));
});

// Reporting the failure and offering the retry belong to the library's error
// notice, which is where the action's rejection is recorded; this component only
// has to keep the rejection from escaping as an unhandled one.
it('leaves a failing maintenance action to the caller that reports it', async () => {
  const handlers = actions();
  handlers.refreshInfo.mockRejectedValueOnce(new Error('failed'));
  render(view(handlers));
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: english.refreshInfo })),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: english.refreshInfo,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
});
