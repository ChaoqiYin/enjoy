import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Video } from '../../shared/api';
import { VideoRow } from './VideoRow';
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

function row(record: Partial<Video> = {}, lastPlayedId: number | null = null) {
  const actions = {
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
  render(
    <I18nextProvider i18n={i18n}>
      {/* The row is a row of a list, so it is drawn the way the board draws it. */}
      <ul>
        <VideoRow
          video={{ ...video, ...record }}
          busy={false}
          actions={actions}
          lastPlayedId={lastPlayedId}
          onMenu={vi.fn()}
        />
      </ul>
    </I18nextProvider>,
  );
  return actions;
}

it('names the video, how long it runs and what can be asked of it', () => {
  const actions = row();
  // The three things the row has to say: which video, how long it is, and the
  // controls. The name is the control that opens the details panel, so pressing
  // it is the same act the card's name answers.
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  expect(actions.details).toHaveBeenCalledWith(video);
  expect(screen.getByText('00:01:05')).toBeTruthy();
  for (const name of [
    english.play,
    english.favorites,
    english.reveal,
    english.removeIndex,
  ]) {
    expect(screen.getByRole('button', { name })).toBeTruthy();
  }
});

it('carries the marks a record can wear into its own line', () => {
  row({ shared: true }, video.id);
  expect(screen.getByText(english.lastPlayedMarker)).toBeTruthy();
  expect(screen.getByRole('img', { name: english.sharedMarker })).toBeTruthy();
});

it('falls back to the volume name when nobody says which video was played', () => {
  row();
  expect(screen.queryByText(english.lastPlayedMarker)).toBeNull();
});
