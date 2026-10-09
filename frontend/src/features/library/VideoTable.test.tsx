import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Video } from '../../shared/api';
import { VideoTable } from './VideoTable';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();
const video: Video = {
  id: 1,
  path: '/movies/example.mp4',
  file_name: 'example.mp4',
  folder_path: '/movies',
  file_size: 1024,
  // A date the platform's own formatter reads back as Jan 15, 2024 whatever the
  // machine's zone is, so the cell can be asked for the year it shows.
  modified_at: Date.UTC(2024, 0, 15, 10, 30),
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

function table(
  record: Partial<Video> = {},
  lastPlayedId: number | null = null,
) {
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
      <VideoTable
        videos={[{ ...video, ...record }]}
        busy={false}
        actions={actions}
        lastPlayedId={lastPlayedId}
        onMenu={vi.fn()}
      />
    </I18nextProvider>,
  );
  return actions;
}

it('lays the facts out as the eight columns the design settled on', () => {
  table();
  // Named, and in order: a reader meets the columns before the records, and
  // the order is what makes two rows comparable. 「格式」 is not among them —
  // the records carry a codec and no container, so a format column would have
  // nothing of its own to say (ADR 0017).
  expect(
    screen.getAllByRole('columnheader').map((head) => head.textContent),
  ).toEqual([
    english.filename,
    english.duration,
    english.resolution,
    english.codec,
    english.fileSize,
    english.modifiedAt,
    english.path,
    english.actions,
  ]);
  expect(
    screen.queryByRole('columnheader', { name: english.format }),
  ).toBeNull();
});

it('writes every fact of the record into its row', () => {
  const actions = table();
  fireEvent.click(screen.getByRole('button', { name: video.file_name }));
  expect(actions.details).toHaveBeenCalledWith(video);
  expect(screen.getByText('00:01:05')).toBeTruthy();
  expect(screen.getByText('1920 × 1080')).toBeTruthy();
  expect(screen.getByText('h264')).toBeTruthy();
  expect(screen.getByText('1 kB')).toBeTruthy();
  expect(screen.getByText(/2024/).textContent).toContain('2024');
  // The whole path, because the row is where a user copies one from: the view
  // is the only place in the library that has room for it.
  expect(screen.getByText(video.path)).toBeTruthy();
  for (const name of [
    english.play,
    english.favorites,
    english.reveal,
    english.removeIndex,
  ]) {
    expect(screen.getByRole('button', { name })).toBeTruthy();
  }
});

it('says what it does not know rather than leaving a cell empty', () => {
  table({ width: null, height: null, codec: null });
  expect(screen.getAllByText(english.unknown).length).toBeGreaterThanOrEqual(2);
});

it('wears the marks beside the name', () => {
  table({ shared: true }, video.id);
  expect(screen.getByText(english.lastPlayedMarker)).toBeTruthy();
  expect(screen.getByRole('img', { name: english.sharedMarker })).toBeTruthy();
});
