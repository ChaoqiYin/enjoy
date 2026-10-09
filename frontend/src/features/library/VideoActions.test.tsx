import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Video } from '../../shared/api';
import { VideoActions } from './VideoActions';
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

function actions() {
  return {
    details: vi.fn(),
    play: vi.fn(),
    favorite: vi.fn(),
    share: vi.fn(),
    reveal: vi.fn(),
    remove: vi.fn(),
    copyPath: vi.fn(),
    regenerate: vi.fn(),
    refreshInfo: vi.fn(),
  } satisfies VideoActionHandlers;
}

function mount({
  record = {},
  iconOnly = false,
  hidePlay = false,
  hideRemove = false,
  handlers = actions(),
  onCard = vi.fn(),
} = {}) {
  render(
    <I18nextProvider i18n={i18n}>
      <div onClick={onCard}>
        <VideoActions
          video={{ ...video, ...record }}
          busy={false}
          actions={handlers}
          iconOnly={iconOnly}
          hidePlay={hidePlay}
          hideRemove={hideRemove}
        />
      </div>
    </I18nextProvider>,
  );
  return { handlers, onCard };
}

it('names every control it offers, and asks for the video it was handed', () => {
  const { handlers } = mount();
  // Each control is the same fact the panel says in words, so the labels are
  // the ones the whole application already uses for these actions.
  for (const name of [
    english.play,
    english.favorites,
    english.reveal,
    english.removeIndex,
  ]) {
    expect(screen.getByRole('button', { name })).toBeTruthy();
  }
  fireEvent.click(screen.getByRole('button', { name: english.play }));
  expect(handlers.play).toHaveBeenCalledWith(video);
  fireEvent.click(screen.getByRole('button', { name: english.reveal }));
  expect(handlers.reveal).toHaveBeenCalledWith(video);
  fireEvent.click(screen.getByRole('button', { name: english.removeIndex }));
  expect(handlers.remove).toHaveBeenCalledWith(video);
});

it('keeps the press from reaching the card around it', () => {
  const { handlers, onCard } = mount();
  fireEvent.click(screen.getByRole('button', { name: english.reveal }));
  fireEvent.doubleClick(screen.getByRole('button', { name: english.reveal }));
  expect(handlers.reveal).toHaveBeenCalledTimes(1);
  expect(onCard).not.toHaveBeenCalled();
});

it('says the favorite state rather than only drawing it', () => {
  const { handlers } = mount({ record: { favorite: true } });
  const button = screen.getByRole('button', { name: english.unfavorite });
  expect(button.getAttribute('aria-pressed')).toBe('true');
  // The selected state is the one the primitive was asked for, so a caller that
  // loses the fill in a theme change still has the words beside it.
  expect(button.getAttribute('data-variant')).toBe('secondary');
  fireEvent.click(button);
  expect(handlers.favorite).toHaveBeenCalledWith({ ...video, favorite: true });
});

it('offers a video that is not a favorite the way to become one', () => {
  mount();
  const button = screen.getByRole('button', { name: english.favorites });
  expect(button.getAttribute('aria-pressed')).toBe('false');
  expect(button.getAttribute('data-variant')).toBe('outline');
});

it('leaves out the actions the caller has taken over', () => {
  // The two views that draw a picture hand play to the overlay on it, and the
  // details panel drops the control that would remove the video it is showing.
  mount({ hidePlay: true, hideRemove: true });
  expect(screen.queryByRole('button', { name: english.play })).toBeNull();
  expect(
    screen.queryByRole('button', { name: english.removeIndex }),
  ).toBeNull();
  expect(screen.getByRole('button', { name: english.favorites })).toBeTruthy();
});
