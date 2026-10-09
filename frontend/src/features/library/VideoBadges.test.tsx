import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Video } from '../../shared/api';
import { VideoBadges } from './VideoBadges';
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

function badges(
  record: Partial<Video> = {},
  lastPlayed = false,
  variant: 'overlay' | 'inline' = 'overlay',
) {
  return (
    <I18nextProvider i18n={i18n}>
      <VideoBadges
        video={{ ...video, ...record }}
        variant={variant}
        lastPlayed={lastPlayed}
      />
    </I18nextProvider>
  );
}

it('wears nothing on a video the library has neither played nor shared', () => {
  const { container } = render(badges());
  expect(container.textContent).toBe('');
  expect(container.querySelector('span')).toBeNull();
});

it('names the video the user last handed to the player, in words', () => {
  const marker = render(badges({}, true)).getByText(english.lastPlayedMarker);
  // Over the picture rather than in a row of the card, so that no row has to
  // make room for it: jsdom lays nothing out, so this pins where the element is
  // put, not where it lands.
  expect(marker.classList.contains('absolute')).toBe(true);
  expect(marker.getAttribute('data-variant')).toBe('default');
});

it('marks a video on the share list with a glyph a reader can still name', () => {
  render(badges({ shared: true }));
  const marker = screen.getByRole('img', { name: english.sharedMarker });
  // A glyph and not a sentence: the card's own words are its file name and its
  // duration, and the library is read by scanning those. The meaning is not in
  // the glyph alone, so it is written on the element the pointer lands on as
  // well as in the name a reader hears.
  expect(marker.textContent).toBe('');
  expect(marker.querySelector('svg')).toBeTruthy();
  expect(marker.getAttribute('title')).toBe(english.sharedMarker);
  // Green means sharing, and it is the semantics the design document keeps even
  // where the drawing repaints it: the primitive's own success variant carries
  // the fill, so the badge says which one it asked for.
  expect(marker.getAttribute('data-variant')).toBe('success');
});

it('wears both marks at once, one on each corner of the picture', () => {
  render(badges({ shared: true }, true));
  const played = screen.getByText(english.lastPlayedMarker);
  const shared = screen.getByRole('img', { name: english.sharedMarker });
  // A video can be both the one just played and one of the ones being shared,
  // so neither mark may be placed where the other would cover it.
  expect(played.classList.contains('start-2')).toBe(true);
  expect(shared.classList.contains('end-2')).toBe(true);
});

it('lays the marks into the flow when the caller asks for the inline form', () => {
  render(badges({ shared: true }, true, 'inline'));
  expect(
    screen.getByText(english.lastPlayedMarker).classList.contains('absolute'),
  ).toBe(false);
  expect(
    screen
      .getByRole('img', { name: english.sharedMarker })
      .classList.contains('absolute'),
  ).toBe(false);
});
