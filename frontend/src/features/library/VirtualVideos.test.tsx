import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Video } from '../../shared/api';
import { VirtualVideos } from './VirtualVideos';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();
const videos: Video[] = Array.from({ length: 1203 }, (_, index) => ({
  id: index + 1,
  path: `/movies/video-${index}.mp4`,
  file_name: `video-${index}.mp4`,
  folder_path: '/movies',
  file_size: 1024,
  modified_at: 0,
  duration_ms: 1000,
  width: 1920,
  height: 1080,
  codec: 'h264',
  thumbnail_path: null,
  favorite: false,
  available: true,
  play_count: 0,
  last_played_at: null,
  created_at: 0,
  updated_at: 0,
}));
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

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.hasAttribute('data-index') ? 100 : 600;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('bounds mounted videos while scrolling and resets filtered results', async () => {
  const onScroll = vi.fn();
  const view = (items: Video[], key: string) => (
    <I18nextProvider i18n={i18n}>
      <VirtualVideos
        key={key}
        videos={items}
        selectedId={null}
        onSelect={vi.fn()}
        onMenu={vi.fn()}
        busy={false}
        actions={actions}
        onScroll={onScroll}
      />
    </I18nextProvider>
  );
  const { container, getByText, queryByText, rerender } = render(
    view(videos, 'all'),
  );
  const viewport =
    container.querySelector('[aria-label="Video Library"]') ??
    container.querySelector('[tabindex="0"]')!;
  await waitFor(() => expect(getByText('video-0.mp4')).toBeTruthy());
  const mounted = () => container.querySelectorAll('article').length;
  expect(mounted()).toBeGreaterThan(0);
  expect(mounted()).toBeLessThan(100);
  fireEvent.scroll(viewport, { target: { scrollTop: 10000 } });
  await waitFor(() => expect(queryByText('video-0.mp4')).toBeNull());
  expect(mounted()).toBeGreaterThan(0);
  expect(mounted()).toBeLessThan(100);
  expect(onScroll).toHaveBeenCalled();
  const totalHeight = parseFloat(
    container.querySelector<HTMLDivElement>('.relative')!.style.height,
  );
  fireEvent.scroll(viewport, { target: { scrollTop: totalHeight - 600 } });
  await waitFor(() => expect(getByText('video-1202.mp4')).toBeTruthy());
  expect(mounted()).toBeLessThan(100);

  rerender(view([videos[1202]], 'filtered'));
  await waitFor(() => expect(getByText('video-1202.mp4')).toBeTruthy());
  expect(mounted()).toBe(1);
  expect(container.querySelector('[tabindex="0"]')?.scrollTop).toBe(0);
});
