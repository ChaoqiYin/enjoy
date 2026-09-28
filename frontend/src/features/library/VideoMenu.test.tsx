import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Video } from '../../shared/api';
import { VideoMenu } from './VideoMenu';
import type { VideoActionHandlers } from './VideoActions';
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
  play_count: 0,
  last_played_at: null,
  created_at: 0,
  updated_at: 0,
};

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

/**
 * The menu over one record, with every action observable. The menu hands each
 * item the video it was opened on, so what a click did is answered by the
 * argument the handler received rather than by reaching into the component.
 */
function open(record: Partial<Video> = {}) {
  const actions: VideoActionHandlers = {
    details: vi.fn(),
    play: vi.fn(),
    favorite: vi.fn(),
    share: vi.fn(),
    reveal: vi.fn(),
    remove: vi.fn(),
    copyPath: vi.fn(),
    regenerate: vi.fn(),
    refreshInfo: vi.fn(),
  };
  const target = { video: { ...video, ...record }, x: 0, y: 0 };
  render(
    <I18nextProvider i18n={i18n}>
      <VideoMenu
        target={target}
        busy={false}
        actions={actions}
        onClose={() => {}}
      />
    </I18nextProvider>,
  );
  return actions;
}

// The item follows the record rather than standing as two entries, as the
// favorite beside it does: a list a video is already on has nothing to offer it.
it('offers the share list to a record that is not on it', () => {
  const actions = open();
  expect(screen.queryByRole('menuitem', { name: english.unshare })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: english.share }));
  expect(actions.share).toHaveBeenCalledWith(video);
});

it('offers to leave the share list for a record that is on it', () => {
  const actions = open({ shared: true });
  expect(screen.queryByRole('menuitem', { name: english.share })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: english.unshare }));
  expect(actions.share).toHaveBeenCalledWith({ ...video, shared: true });
});
