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
import type { ScanStatus, Video } from '../../shared/api';
import { idleScan } from '../../test/fixtures';
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
  // Mid-year on purpose: whichever side of midnight a timezone lands on, the
  // year the panel prints is the year the record carries.
  modified_at: Date.UTC(2026, 8, 16, 12, 0),
  duration_ms: 65000,
  width: 1920,
  height: 1080,
  codec: 'h264',
  thumbnail_path: null,
  favorite: false,
  shared: false,
  play_count: 3,
  last_played_at: 10,
  created_at: 0,
  updated_at: 0,
};
const actions = () => ({
  details: vi.fn(),
  play: vi.fn(),
  favorite: vi.fn(),
  share: vi.fn(),
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
function view(
  handlers = actions(),
  busy = false,
  source = video,
  scan?: ScanStatus,
) {
  return (
    <I18nextProvider i18n={i18n}>
      <VideoDetails video={source} actions={handlers} busy={busy} scan={scan} />
    </I18nextProvider>
  );
}

/** The key-value table as it is drawn: each row's term beside its value. */
function metaRows() {
  return Array.from(
    document.querySelectorAll('[data-slot="video-meta-row"]'),
  ).map((row) => [
    row.querySelector('dt')?.textContent,
    row.querySelector('dd')?.textContent,
  ]);
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

it('reads the file out in the terms the panel names, in their order', () => {
  render(view());
  const rows = metaRows();
  expect(rows.map(([term]) => term)).toEqual([
    english.duration,
    english.resolution,
    english.codec,
    english.fileSize,
    english.modifiedAt,
  ]);
  expect(rows[0][1]).toBe('00:01:05');
  // The drawing marks the class a resolution belongs to beside the numbers it
  // read that class off.
  expect(rows[1][1]).toBe('1920 × 1080FHD');
  expect(rows[2][1]).toBe('h264');
  expect(rows[3][1]).toBe('1 kB');
  expect(rows[4][1]).toContain('2026');
});

it('answers a term it has no value for rather than leaving it blank', () => {
  render(view(actions(), false, { ...video, width: null, height: null }));
  expect(metaRows()[1][1]).toBe(english.unknown);
});

it('hands the video to the copy the caller owns, which is what reports it', () => {
  const handlers = actions();
  render(view(handlers));
  // What the copy does about telling the user — the short hint on the way out
  // and the notice on the way back — belongs to the action, not to this panel.
  fireEvent.click(screen.getByRole('button', { name: english.copyPath }));
  expect(handlers.copyPath).toHaveBeenCalledWith(video);
});

it('stands in for the picture while this very file is being prepared', () => {
  render(
    view(
      actions(),
      false,
      video,
      idleScan({ phase: 'processing', currentPath: video.path }),
    ),
  );
  expect(
    screen.getByRole('status', {
      name: english.mediaPreparingName.replace('{{name}}', video.file_name),
    }),
  ).toBeTruthy();
});

it('leaves the picture to the placeholder that says why it is not here yet', () => {
  render(view());
  expect(screen.getByText(english.thumbnailPending)).toBeTruthy();
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

it('gives the reason neither maintenance action can be pressed right now', () => {
  render(view(actions(), true));
  expect(screen.getByText(english.busy)).toBeTruthy();
  for (const name of [english.regenerate, english.refreshInfo]) {
    expect(
      (screen.getByRole('button', { name }) as HTMLButtonElement).disabled,
    ).toBe(true);
  }
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
