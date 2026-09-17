import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorNotice } from '../shared/ErrorNotice';
import { Thumbnail } from '../features/library/Thumbnail';
import { VideoCard } from '../features/library/VideoCard';
import type { ScanStatus, Video } from '../shared/api';
import english from '../../../shared/locales/en/common.json';
import chinese from '../../../shared/locales/zh-CN/common.json';
import englishErrors from '../../../shared/locales/en/errors.json';
import chineseErrors from '../../../shared/locales/zh-CN/errors.json';

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
  play_count: 0,
  last_played_at: null,
  created_at: 0,
  updated_at: 0,
};

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'translation',
    keySeparator: false,
    resources: {
      en: { translation: english, errors: englishErrors },
      'zh-CN': { translation: chinese, errors: chineseErrors },
    },
    interpolation: { escapeValue: false },
  });
});
afterEach(cleanup);

describe('localized errors', () => {
  it('updates an existing error when language changes and retains its reference', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ErrorNotice
          error={{
            code: 'media.tool.not_found',
            params: { tool: 'ffprobe' },
            errorId: 'err_test',
          }}
          onClose={vi.fn()}
          onRetry={vi.fn()}
        />
      </I18nextProvider>,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Media tool ffprobe was not found',
    );
    await act(() => i18n.changeLanguage('zh-CN'));
    expect(screen.getByRole('alert').textContent).toContain(
      chineseErrors['media.tool.not_found'].replace('{{tool}}', 'ffprobe'),
    );
    expect(screen.getByRole('alert').textContent).toContain('err_test');
  });

  it('uses a generic localized message for an unknown error', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ErrorNotice
          error={{
            code: 'unknown.secret.detail',
            params: {},
            errorId: 'err_unknown',
          }}
          onClose={vi.fn()}
          onRetry={vi.fn()}
        />
      </I18nextProvider>,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      englishErrors['app.unexpected'],
    );
    expect(screen.getByRole('alert').textContent).not.toContain(
      'unknown.secret.detail',
    );
  });
});

describe('video card actions', () => {
  function mount(lastPlayedId: number | null = null) {
    const actions = {
      play: vi.fn(),
      favorite: vi.fn(),
      reveal: vi.fn(),
      remove: vi.fn(),
      copyPath: vi.fn(),
      regenerate: vi.fn(),
      refreshInfo: vi.fn(),
      details: vi.fn(),
    };
    render(
      <I18nextProvider i18n={i18n}>
        <VideoCard
          video={video}
          onMenu={vi.fn()}
          busy={false}
          actions={actions}
          lastPlayedId={lastPlayedId}
        />
      </I18nextProvider>,
    );
    return actions;
  }
  it('opens details on click and only plays through the explicit action', () => {
    const actions = mount();
    fireEvent.click(screen.getByText('00:01:05'));
    expect(actions.details).toHaveBeenCalledOnce();
    fireEvent.doubleClick(screen.getByText('00:01:05'));
    expect(actions.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(actions.play).toHaveBeenCalledTimes(1);
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Favorites' }));
    expect(actions.play).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }));
    expect(actions.favorite).toHaveBeenCalledOnce();
  });
  it('keeps action keyboard gestures separate from card activation', () => {
    const actions = mount();
    const card = screen.getByRole('article');
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(actions.details).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Play' }), {
      key: 'Enter',
    });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Favorites' }), {
      key: ' ',
    });
    expect(actions.details).toHaveBeenCalledTimes(2);
  });
  it('keeps the card the only tab stop its press gesture adds', () => {
    mount();
    // The animation library's press gesture turns the element carrying it into
    // a tab stop when that element has no tabindex of its own, and the actions
    // container now carries the gesture so it can claim the pointer press
    // before the card does. Tabbing into a card must not land on that wrapper.
    // This only asserts the DOM the gesture leaves behind: it proves no new
    // `tabindex="0"` appears inside the card, not that the press really stops at
    // the actions container, and jsdom does not render the gesture at all. Both
    // are confirmed by a desktop walkthrough.
    const card = screen.getByRole('article');
    expect(card.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
  });
  it('marks the card and its file name button as pointer targets', () => {
    mount();
    const card = screen.getByRole('article');
    // The file name is a <button>, and the UA stylesheet gives buttons
    // `cursor: default`, which beats inheritance from the card, so it has to
    // declare the pointer cursor itself.
    const fileName = screen.getByRole('button', { name: video.file_name });
    // jsdom loads no stylesheets and computes no styles, so these assertions only
    // prove the utilities are applied; they do not verify the pointer cursor a
    // browser would paint. The real cursor is confirmed by a desktop walkthrough.
    expect(card.classList.contains('cursor-pointer')).toBe(true);
    expect(fileName.classList.contains('cursor-pointer')).toBe(true);
  });
  it('anchors the title tooltip to the file name, not the title row', () => {
    mount();
    // daisyUI opens the bubble on the `:hover` of the element carrying
    // `data-tip`, and descendants satisfy that too, so an anchor spanning the
    // title row pops the tip from the empty space beside the name — and, the
    // bubble being aligned to the anchor's inline end, parks it at the far edge
    // of the card. `w-fit` is what keeps the anchor on the name; `max-w-full`
    // is what still lets a long name ellipsise instead of running past the row.
    // jsdom lays nothing out, so this only proves the utilities are applied.
    // The trigger region itself was measured on the built page with a real
    // pointer: the bubble opens between the name's own edges and nowhere else.
    const anchor = screen
      .getByRole('article')
      .querySelector('.card-title > .tooltip');
    expect(anchor?.classList.contains('w-fit')).toBe(true);
    expect(anchor?.classList.contains('max-w-full')).toBe(true);
    expect(anchor?.classList.contains('w-full')).toBe(false);
  });
  it('leaves a card the user has not played unmarked', () => {
    mount();
    expect(screen.queryByText('Last played')).toBeNull();
  });
  it('marks the card of the video the user last played', () => {
    mount(video.id);
    const card = screen.getByRole('article');
    // The marker is written over the thumbnail's corner rather than into one of
    // the card's rows, so that the card keeps its height — every row estimate
    // and every geometry measured for the hover feedback hang off it. jsdom
    // lays nothing out, so this proves where the element is put, not where it
    // lands: the corner it paints on is measured in the browser.
    const marker = screen.getByText('Last played');
    expect(card.contains(marker)).toBe(true);
    expect(marker.classList.contains('absolute')).toBe(true);
    expect(card.querySelector('.card-body')?.contains(marker)).toBe(false);
  });
  it('does not gate play on any per-record availability state', () => {
    const actions = mount();
    fireEvent.doubleClick(screen.getByText('00:01:05'));
    expect(actions.play).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});

it('shows preparation only for the current file and clears it after termination', () => {
  const scan: ScanStatus = {
    background: false,
    phase: 'processing',
    changes: { added: 0, updated: 0, removed: 0 },
    failures: 0,
    unreachableDirectories: 0,
    discovered: 2,
    processed: 0,
    indexed: 2,
    metadataReady: 0,
    thumbnailsReady: 0,
    currentPath: video.path,
  };
  const preview = (status: ScanStatus) => (
    <I18nextProvider i18n={i18n}>
      <Thumbnail
        path={null}
        name={video.file_name}
        videoPath={video.path}
        scan={status}
      />
    </I18nextProvider>
  );
  const { rerender } = render(preview(scan));
  expect(screen.getByRole('status').textContent).toBe('Preparing preview');
  rerender(preview({ ...scan, phase: 'paused' }));
  expect(screen.getByRole('status').textContent).toBe(
    'Preview preparation paused',
  );
  rerender(preview({ ...scan, currentPath: '/movies/other.mp4' }));
  expect(screen.queryByRole('status')).toBeNull();
  for (const phase of ['complete', 'failed', 'cancelled']) {
    rerender(preview({ ...scan, phase }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Thumbnail pending')).toBeTruthy();
  }
});
