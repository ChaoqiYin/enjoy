// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import {
  backend,
  library,
  notices,
  resetSharePage,
  scan,
  status,
  windowMock,
} from '../../test/sharePage';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { ShareProvider } from './ShareProvider';
import { SharePage } from '../../pages/SharePage';
import english from '../../../../shared/locales/en/common.json';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  convertFileSrc: (path: string) => path,
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: (
      handler: (event: { preventDefault: () => void }) => void,
    ) => windowMock.onCloseRequested(handler),
    close: () => windowMock.close(),
  }),
}));
vi.mock('../library/useVideos', () => ({ useVideos: () => library }));
vi.mock('../library/useScan', () => ({ useScan: () => scan }));
vi.mock('../library/useNotices', () => ({ useNotices: () => notices }));
vi.mock('../space/SpaceProvider', () => ({
  useSpace: () => ({ id: 7, name: 'Acceptance' }),
}));

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  resetSharePage(invoke);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * The page as a user meets it, with the provider above it: the service outlives
 * a visit to the page that started it, and the window can be closed from any
 * page, which is why the question is the provider's.
 */
function page() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <ShareProvider>
          <SharePage />
        </ShareProvider>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

/**
 * The window being closed, as the window asks: the handler the provider
 * subscribed is called, and what it did with the event is the answer.
 */
function closeTheWindow(): boolean {
  let prevented = false;
  windowMock.handler?.({
    preventDefault: () => {
      prevented = true;
    },
  });
  return prevented;
}

/**
 * What the 共享服务 costs when the window is closed, which the page it is
 * started from is not the right home for.
 *
 * The window can be closed from any page — the service is the whole
 * application's, and it outlives a visit to the page that started it — so the
 * question is asked by the provider that sits above every page, and it is asked
 * here rather than in the sharing page's own tests. The page is mounted anyway,
 * because a user being asked would be looking at one.
 */
it('holds the window open while the service is running, and asks first', async () => {
  backend(invoke, {
    share_status: status({ port: 4918 }),
    close_share: status(),
  });
  page();
  await screen.findByRole('button', { name: english.stopSharing });
  await waitFor(() => expect(windowMock.handler).toBeDefined());

  // The window is closing, and it is held: nothing has been stopped and nothing
  // has been closed, because the user has not answered yet.
  expect(closeTheWindow()).toBe(true);
  const question = await screen.findByRole('dialog');
  expect(question.textContent).toContain(english.shareCloseQuestion);
  expect(invoke).not.toHaveBeenCalledWith('close_share');
  expect(windowMock.close).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole('button', { name: english.shareCloseConfirm }),
  );
  // Both, and the service first: the process going away releases the port, but
  // the connections a device is holding are closed by the service stopping.
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('close_share'));
  await waitFor(() => expect(windowMock.close).toHaveBeenCalled());
});

it('lets the window close without a word when nothing is being shared', async () => {
  backend(invoke, { share_status: status() });
  page();
  await screen.findByText(english.connectionIdle);
  await waitFor(() => expect(windowMock.handler).toBeDefined());

  // A prompt on every close is one the user learns to dismiss without reading,
  // and there is nothing here to interrupt.
  expect(closeTheWindow()).toBe(false);
  expect(screen.queryByRole('dialog')).toBeNull();

  // Said no to, the window stays open and the service keeps running.
  cleanup();
  backend(invoke, {
    share_status: status({ port: 4918 }),
    close_share: status(),
  });
  page();
  await screen.findByRole('button', { name: english.stopSharing });
  await waitFor(() => expect(windowMock.handler).toBeDefined());
  closeTheWindow();
  fireEvent.click(await screen.findByRole('button', { name: english.cancel }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(windowMock.close).not.toHaveBeenCalled();
});
