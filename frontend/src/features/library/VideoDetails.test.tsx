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
import type { ScanStatus, Video, VideoField } from '../../shared/api';
import { pluginPort } from '../../test/doubles';
import { idleScan } from '../../test/fixtures';
import type { PluginContext } from '../../plugins/host';
import { PluginHostProvider } from '../../plugins/PluginHostProvider';
import type { VideoPanelParams } from '../../plugins/mountPoints';
import { VideoDetails } from './VideoDetails';
import english from '../../../../shared/locales/en/common.json';
import chineseMessages from '../../../../shared/locales/zh-CN/common.json';
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
  cover_path: null,
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
  fields: VideoField[] = [],
) {
  return (
    <I18nextProvider i18n={i18n}>
      <VideoDetails
        video={source}
        space={{ id: 1 }}
        actions={handlers}
        busy={busy}
        scan={scan}
        fields={fields}
      />
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

it('reads out the fields the plugins wrote, each beside the plugin that wrote it', () => {
  render(
    view(actions(), false, video, undefined, [
      { key: 'cover', value: '/covers/1.jpg', source_plugin: 'cover-fetcher' },
      { key: 'rating', value: '8.1', source_plugin: 'metadata-fetcher' },
    ]),
  );
  // After the record's own terms, because they are not terms the record has:
  // the panel reads the file out first, and what the plugins added comes after
  // it in the order the backend handed them over. The key is drawn as the
  // label the closed set of field keys carries (`field.<key>` in the
  // translations), so the term reads as a word rather than as the key a
  // plugin filed the value under (spec #96 §9).
  expect(metaRows().map(([term]) => term)).toEqual([
    english.duration,
    english.resolution,
    english.codec,
    english.fileSize,
    english.modifiedAt,
    english['field.cover'],
    english['field.rating'],
  ]);
  // And the source is readable, which is the whole of what it is there for: the
  // user can tell whose value they are looking at, including after the plugin
  // that wrote it is gone (User Story 10).
  const sources = Array.from(
    document.querySelectorAll(
      '[data-slot="video-meta-row"] [data-slot="badge"][data-variant="outline"]',
    ),
  ).map((badge) => badge.textContent);
  expect(sources).toEqual(['cover-fetcher', 'metadata-fetcher']);
});

it('draws the same field label in the language the window is in', async () => {
  const chinese = createInstance();
  await chinese.init({
    lng: 'zh-CN',
    resources: { 'zh-CN': { translation: chineseMessages } },
  });
  render(
    <I18nextProvider i18n={chinese}>
      <VideoDetails
        video={video}
        space={{ id: 1 }}
        actions={actions()}
        busy={false}
        fields={[
          {
            key: 'cover',
            value: '/covers/1.jpg',
            source_plugin: 'cover-fetcher',
          },
        ]}
      />
    </I18nextProvider>,
  );
  // The label is the translated word in both languages, never the key itself:
  // `field.cover` reads 封面 here and Cover in the test above.
  expect(metaRows().map(([term]) => term)).toContain(
    chineseMessages['field.cover'],
  );
  expect(chineseMessages['field.cover']).not.toBe('cover');
});

it('falls back to the key itself when a stored field has no label', () => {
  render(
    view(actions(), false, video, undefined, [
      { key: 'year', value: '1999', source_plugin: 'metadata-fetcher' },
    ]),
  );
  // Rows written before the field keys were closed stay in the library — the
  // kernel drops unknown keys on the way in, it does not migrate what is
  // already there — and a label the translations do not have must read as the
  // key rather than as nothing at all.
  expect(metaRows().map(([term]) => term)).toContain('year');
});

it('draws the block a plugin registered in the panel, with the space and the video it is about', async () => {
  // The panel is the render side of `video.panel`: a plugin registers a block
  // and it is drawn here, in the one place a video's details are read. What the
  // mount point hands the block is the space the window is in and the video the
  // panel is describing — the whole of what a block is told
  // (`shared/plugins/mount-points.json`).
  const handed: VideoPanelParams[] = [];
  render(
    <I18nextProvider i18n={i18n}>
      <PluginHostProvider
        port={pluginPort([
          {
            id: 'a-plugin',
            name: 'A plugin',
            author: 'someone',
            capabilities: [],
            enabled: true,
            entry: 'a/interface.js',
            hasBody: false,
            failure: null,
          },
        ])}
        loadEntry={async () => ({
          default: (_baseline: unknown, context: PluginContext) => {
            context.draw('video.panel', {
              key: 'stats',
              draw: (params: VideoPanelParams) => {
                handed.push(params);
                return <p>drawn by the plugin</p>;
              },
            });
          },
        })}
      >
        <VideoDetails
          video={video}
          space={{ id: 7 }}
          actions={actions()}
          busy={false}
        />
      </PluginHostProvider>
    </I18nextProvider>,
  );
  const block = await screen.findByText('drawn by the plugin');
  expect(handed).toEqual([
    { space: { id: 7 }, video: { id: 1, path: '/movies/example.mp4' } },
  ]);
  // In the panel and above the record's own terms: the panel keeps the room for
  // a plugin's own area between the file's own header and the table, and that
  // is the position a block is drawn in.
  const firstTerm = document.querySelector('[data-slot="video-meta-row"]');
  expect(firstTerm).not.toBeNull();
  expect(
    block.compareDocumentPosition(firstTerm as Node) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('adds no row at all for a library whose plugins wrote nothing', () => {
  render(view());
  // 内核自己的界面不被插件系统弄脏 (User Story 13): a library with no plugins
  // looks exactly like a library that never had any, down to the number of rows.
  expect(metaRows().length).toBe(5);
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
