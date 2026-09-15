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
  available: true,
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
  function mount(available = true) {
    const actions = {
      play: vi.fn(),
      favorite: vi.fn(),
      reveal: vi.fn(),
      remove: vi.fn(),
      regenerate: vi.fn(),
      refreshInfo: vi.fn(),
      details: vi.fn(),
    };
    render(
      <I18nextProvider i18n={i18n}>
        <VideoCard
          video={{ ...video, available }}
          selectedId={null}
          onSelect={vi.fn()}
          onMenu={vi.fn()}
          busy={false}
          actions={actions}
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
    fireEvent.keyDown(screen.getByRole('button', { name: 'Play' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Favorites' }), { key: ' ' });
    expect(actions.details).toHaveBeenCalledTimes(2);
  });
  it('prevents unavailable videos from starting', () => {
    const actions = mount(false);
    fireEvent.doubleClick(screen.getByText('00:01:05'));
    expect(actions.play).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

it('shows preparation only for the current file and clears it after termination', () => {
  const scan: ScanStatus = {
    background: false,
    phase: 'processing',
    changes: { added: 0, updated: 0, unavailable: 0 },
    failures: 0,
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
