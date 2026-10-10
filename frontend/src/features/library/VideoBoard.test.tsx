import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Video } from '../../shared/api';
import { VideoBoard } from './VideoBoard';
import type { ViewMode } from './listing';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();
const videos: Video[] = [1, 2, 3].map((id) => ({
  id,
  path: `/movies/film-${id}.mp4`,
  file_name: `film-${id}.mp4`,
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
}));

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

function board(viewMode: ViewMode) {
  render(
    <I18nextProvider i18n={i18n}>
      <VideoBoard
        videos={videos}
        viewMode={viewMode}
        busy={false}
        actions={{
          details: vi.fn(),
          play: vi.fn(),
          favorite: vi.fn(),
          share: vi.fn(),
          reveal: vi.fn(),
          remove: vi.fn(),
          copyPath: vi.fn(),
          regenerate: vi.fn(),
          refreshInfo: vi.fn(),
        }}
        lastPlayedId={null}
        onMenu={vi.fn()}
      />
    </I18nextProvider>,
  );
}

it('draws the grid as one block per record', () => {
  board('grid');
  // Every record is a card, and nothing else is: a board that drew two of the
  // three shapes at once would show a user the same video twice.
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  expect(screen.queryByRole('table')).toBeNull();
  for (const video of videos) {
    expect(screen.getByRole('button', { name: video.file_name })).toBeTruthy();
  }
});

it('sizes the grid from the width it is given rather than from the viewport', () => {
  board('grid');
  // The columns are fitted to the content width by the browser, so widening the
  // window adds columns instead of stretching the cards. A viewport breakpoint
  // cannot see the width the grid actually got, and a capped content column
  // stopped answering to the window at all — which is how the columns came to
  // freeze at three however wide the window was (ADR 0019). jsdom lays nothing
  // out, so the class is the whole of what can be asserted here; the counts
  // themselves are checked against a real layout.
  // Found rather than walked to: the card has worn a `BorderGlow` wrapper since
  // ADR 0021, so its parent is that wrapper's content box and the grid is two
  // levels further up. Naming the grid by its own column class keeps this about
  // the grid instead of about how deep a card happens to sit.
  const grid = screen
    .getAllByRole('article')[0]
    .closest('[class*="grid-cols-"]') as HTMLElement;
  expect(grid.className).toContain(
    'repeat(auto-fill,minmax(min(200px,100%),1fr))',
  );
  expect(grid.className).not.toMatch(/(^|\s)(sm|lg|xl|2xl):grid-cols-/);
});

it('draws the compact list as a list of rows', () => {
  board('list');
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  expect(screen.queryByRole('table')).toBeNull();
  const rows = screen.getAllByRole('listitem');
  expect(rows).toHaveLength(3);
  rows.forEach((row, index) => {
    expect(row.textContent).toContain(videos[index].file_name);
  });
});

it('draws the table as a table of records', () => {
  board('table');
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  expect(screen.getByRole('table')).toBeTruthy();
  expect(screen.getAllByRole('row')).toHaveLength(4);
  // The header plus one row per record, each naming its own file.
  for (const video of videos) {
    expect(screen.getByRole('button', { name: video.file_name })).toBeTruthy();
  }
});
