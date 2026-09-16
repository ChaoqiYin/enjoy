import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Video } from '../../shared/api';
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
  modified_at: 0,
  duration_ms: 65000,
  width: 1920,
  height: 1080,
  codec: 'h264',
  thumbnail_path: null,
  favorite: false,
  play_count: 3,
  last_played_at: 10,
  created_at: 0,
  updated_at: 0,
};
const actions = () => ({
  details: vi.fn(),
  play: vi.fn(),
  favorite: vi.fn(),
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
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);
function view(handlers = actions(), onClose = vi.fn(), busy = false) {
  return (
    <I18nextProvider i18n={i18n}>
      <VideoDetails
        video={video}
        actions={handlers}
        busy={busy}
        onClose={onClose}
      />
    </I18nextProvider>
  );
}
it('keeps focus stable through updates and restores it on dismissal', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const result = render(view());
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(
    true,
  );
  const copy = screen.getByRole('button', { name: english.copyPath });
  copy.focus();
  result.rerender(view());
  expect(document.activeElement).toBe(copy);
  result.unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
it('falls back to the page when the original card was unmounted', () => {
  const page = document.createElement('main');
  page.tabIndex = -1;
  const trigger = document.createElement('button');
  page.append(trigger);
  document.body.append(page);
  trigger.focus();
  const result = render(view());
  trigger.remove();
  result.unmount();
  expect(document.activeElement).toBe(page);
  page.remove();
});
it('closes with Escape or the backdrop and confines keyboard focus', () => {
  const close = vi.fn();
  render(view(actions(), close));
  const dialog = screen.getByRole('dialog');
  const buttons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
  );
  const last = buttons[buttons.length - 1];
  last.focus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
  fireEvent.click(
    screen.getAllByRole('button', { name: english.closeDetails })[0],
  );
  expect(close).toHaveBeenCalledTimes(2);
});
it('reports maintenance failure and retries without losing existing details', async () => {
  const handlers = actions();
  handlers.refreshInfo
    .mockRejectedValueOnce(new Error('failed'))
    .mockResolvedValue(undefined);
  render(view(handlers));
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: english.refreshInfo })),
  );
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText('example.mp4')).toBeTruthy();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: english.retry })),
  );
  expect(handlers.refreshInfo).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});
