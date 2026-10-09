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

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms per call; floating-ui asks every ancestor of the panel
// whether it sits in the top layer, so opening one menu spends several seconds
// of that. Nothing under test is a top-layer element, so answering `false`
// outright is both correct here and instant.
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

/**
 * The menu over one record, opened where the pointer asked for it. It is drawn
 * when the caller has a target and unmounts when the caller clears it, so what
 * "closing" means here is the caller being told, which is what `onClose` is for.
 */
function open(record: Partial<Video> = {}, busy = false) {
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
  const onClose = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <VideoMenu
        target={{ video: { ...video, ...record }, x: 240, y: 180 }}
        busy={busy}
        actions={actions}
        onClose={onClose}
      />
    </I18nextProvider>,
  );
  return { actions, onClose };
}

it('says which record it belongs to and lists what can be done with it', () => {
  open();
  // A reader meets the menu before its items, and a page can have more than one
  // record on screen, so the menu says whose it is rather than being an
  // anonymous list of verbs.
  const menu = screen.getByRole('menu', { name: video.file_name });
  expect(
    screen.getAllByRole('menuitem').map((item) => item.textContent),
  ).toEqual([
    english.details,
    english.play,
    english.favorites,
    english.share,
    english.reveal,
    english.regenerate,
    english.removeIndex,
  ]);
  expect(menu.textContent).toContain(english.play);
});

it('runs the item that was chosen and closes behind it', () => {
  const { actions, onClose } = open();
  fireEvent.click(screen.getByRole('menuitem', { name: english.play }));
  expect(actions.play).toHaveBeenCalledWith(video);
  expect(onClose).toHaveBeenCalled();
});

it('closes without choosing anything on Escape', () => {
  const { actions, onClose } = open();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
  expect(actions.play).not.toHaveBeenCalled();
  expect(actions.details).not.toHaveBeenCalled();
});

it('leaves the items that need a free library out of reach while one runs', () => {
  const { actions, onClose } = open({}, true);
  // Reading the record's details is a read of what is already here, so it stays
  // available; everything that touches the library waits for the task.
  const item = (name: string) => screen.getByRole('menuitem', { name });
  expect(item(english.details).getAttribute('aria-disabled')).not.toBe('true');
  for (const name of [
    english.play,
    english.favorites,
    english.share,
    english.reveal,
    english.regenerate,
    english.removeIndex,
  ]) {
    expect(item(name).getAttribute('aria-disabled')).toBe('true');
  }
  fireEvent.click(item(english.removeIndex));
  fireEvent.click(item(english.play));
  expect(actions.remove).not.toHaveBeenCalled();
  expect(actions.play).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

// The item follows the record rather than standing as two entries, as the
// favorite beside it does: a list a video is already on has nothing to offer it.
it('offers the share list to a record that is not on it', () => {
  const { actions } = open();
  expect(screen.queryByRole('menuitem', { name: english.unshare })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: english.share }));
  expect(actions.share).toHaveBeenCalledWith(video);
});

it('offers to leave the share list for a record that is on it', () => {
  const { actions } = open({ shared: true });
  expect(screen.queryByRole('menuitem', { name: english.share })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: english.unshare }));
  expect(actions.share).toHaveBeenCalledWith({ ...video, shared: true });
});
