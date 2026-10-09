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
  shared: false,
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
  function mount(
    lastPlayedId: number | null = null,
    overrides: Partial<Video> = {},
  ) {
    const actions = {
      play: vi.fn(),
      favorite: vi.fn(),
      share: vi.fn(),
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
          video={{ ...video, ...overrides }}
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
  it('paints a focus ring on the card the keyboard lands on', () => {
    mount();
    const card = screen.getByRole('article');
    // The card keeps a transparent outline so that the one the pointer raises on
    // hover is a colour change rather than a size one, which means the keyboard
    // gets no marker from it at all unless focus names its own colour. The
    // `--ring` token is the colour the rest of the app focuses with, so the
    // card's own outline is turned on in it while focused. jsdom computes no
    // styles, so this pins the utility, not the ring a browser paints.
    expect(card.classList.contains('focus-visible:outline-ring')).toBe(true);
  });
  it('hangs the title tooltip off the file name itself', () => {
    mount();
    // The bubble belongs to the name, not to the title row: a row-wide anchor
    // would pop it from the empty space beside a short name. The trigger is
    // therefore the name's own button, and Radix opens it when that button is
    // reached by focus as well as by pointer. jsdom lays nothing out, so where
    // the bubble lands is confirmed in the browser; this pins which element
    // owns it.
    const fileName = screen.getByRole('button', { name: video.file_name });
    act(() => fileName.focus());
    expect(screen.getByRole('tooltip').textContent).toBe(video.file_name);
  });
  it('leaves a card the user has not played unmarked', () => {
    mount();
    expect(screen.queryByText('Last played')).toBeNull();
  });
  it('marks the card of the video the user last played', () => {
    mount(video.id);
    const card = screen.getByRole('article');
    // The marker is written over the thumbnail's corner rather than into one of
    // the card's rows, so that no row has to make room for it and every card in
    // a row keeps the height its own picture gives it. jsdom lays nothing out,
    // so this proves where the element is put, not where it lands: the corner it
    // paints on is measured in the browser.
    const marker = screen.getByText('Last played');
    expect(card.contains(marker)).toBe(true);
    expect(marker.classList.contains('absolute')).toBe(true);
    // The row that carries the duration is the card's body, and the mark is not
    // written into it — that is the whole of what "over the picture" means
    // here, and it is what keeps the body's height a fact about the text in it.
    expect(screen.getByText('00:01:05').parentElement?.contains(marker)).toBe(
      false,
    );
  });
  it('leaves a video that is not on the 共享清单 unmarked', () => {
    mount();
    // Asked for by the words the glyph stands for, which is how a reader without
    // the picture meets it too.
    expect(screen.queryByRole('img', { name: 'Shared' })).toBeNull();
  });
  it('marks the card of a video that is on the 共享清单', () => {
    // Both marks at once, because they are the two a card can wear and they have
    // to be readable together: the played one over the thumbnail's start corner
    // and this one over its end corner, so neither covers the other.
    mount(video.id, { shared: true });
    const card = screen.getByRole('article');
    const marker = screen.getByRole('img', { name: 'Shared' });
    expect(card.contains(marker)).toBe(true);
    expect(marker.classList.contains('absolute')).toBe(true);
    expect(marker.classList.contains('end-2')).toBe(true);
    // Sharing wears the business token pair the design document keeps for this
    // mark even where the pages repaint it — `status-shared` for the fill and
    // `status-shared-border` for its edge — rather than a primitive's colour.
    // The fill alone cannot separate the badge from the photograph it sits on
    // (it is opaque, so the picture never reaches under it), which leaves the
    // edge to carry the mark; both halves are pinned here, not the variant name.
    expect(marker.getAttribute('data-variant')).toBe('share');
    expect(marker.classList.contains('bg-share')).toBe(true);
    expect(marker.classList.contains('border-share-border')).toBe(true);
    // A glyph and not a sentence: the card's own words are its file name and its
    // duration, and the library is read by scanning those.
    expect(marker.textContent).toBe('');
    expect(marker.querySelector('svg')).toBeTruthy();
    // The meaning is not in the glyph alone: it is written on the element the
    // pointer lands on, as well as in the name a reader hears.
    expect(marker.getAttribute('title')).toBe('Shared');
    expect(screen.getByText('Last played').classList.contains('start-2')).toBe(
      true,
    );
    // Written over the picture, not into the card's body, so the two marks never
    // make a row taller than the text in it.
    expect(screen.getByText('00:01:05').parentElement?.contains(marker)).toBe(
      false,
    );
  });
  it('offers the play that starts the video exactly once', () => {
    mount();
    // The picture carries the play affordance and the action row does not, so a
    // reader hears one control named Play rather than two that do the same
    // thing. Both are the same action, and both are the card's own: nothing
    // here is a hidden duplicate of the other.
    expect(screen.getAllByRole('button', { name: 'Play' })).toHaveLength(1);
    // The card the play sits on is still the thing a click opens the details
    // panel with, so the play button must be inside it rather than beside it.
    expect(
      screen
        .getByRole('article')
        .contains(screen.getByRole('button', { name: 'Play' })),
    ).toBe(true);
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
