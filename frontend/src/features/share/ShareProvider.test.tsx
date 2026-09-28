// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import {
  backend,
  busy,
  library,
  notices,
  resetSharePage,
  scan,
  status,
  videoActions,
} from '../../test/sharePage';
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
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ShareProvider } from './ShareProvider';
import { SharePage } from '../../pages/SharePage';
import english from '../../../../shared/locales/en/common.json';
import errors from '../../../../shared/locales/en/errors.json';

/**
 * The question a close arrives as, and what the two answers do.
 *
 * Which closes are held is the backend's to decide and is tested there
 * (`crate::closing`): a service is running, or it is not, and this side cannot
 * tell the difference from a message it is sent. What is this side's is the
 * question and the answer — asking the user, and answering with the one command
 * that ends the service and closes the window.
 *
 * The page is mounted anyway, because a user being asked would be looking at
 * one — and because the question belongs to the provider for the reason it
 * always did: the window can be closed from any page, and the service outlives
 * a visit to the one that started it.
 */
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  convertFileSrc: (path: string) => path,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('../library/useVideos', () => ({ useVideos: () => library }));
vi.mock('../library/useVideoActions', () => ({
  useVideoActions: () => videoActions,
}));
vi.mock('../library/useBusy', () => ({ useBusy: () => busy }));
vi.mock('../library/useScan', () => ({ useScan: () => scan }));
vi.mock('../library/useNotices', () => ({ useNotices: () => notices }));
vi.mock('../space/SpaceProvider', () => ({
  useSpace: () => ({ id: 7, name: 'Acceptance' }),
}));

const i18n = createInstance();

/**
 * The backend asking for an answer, which is the only way a question arrives:
 * the listener the provider subscribed is called with nothing, because the event
 * carries nothing.
 */
let askedToClose: (() => void) | undefined;

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english, errors } },
  });
  resetSharePage(invoke, listen);
  askedToClose = undefined;
  vi.mocked(listen).mockImplementation((async (
    event: string,
    handler: () => void,
  ) => {
    if (event === 'close-requested') askedToClose = handler;
    // Nothing else subscribes here: the library's own providers are the ones
    // that follow the scan, and they are not mounted in this test.
    return () => {};
  }) as never);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

/** The page as a user meets it, with the provider above it. */
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

/** The backend holding a close and waiting for an answer. */
async function theBackendAsks() {
  await act(async () => {
    askedToClose?.();
  });
}

function question() {
  return screen.queryByRole('dialog', { name: english.shareCloseQuestion });
}

it('asks the user before closing, and closes through the backend when the answer is yes', async () => {
  backend(invoke, { share_status: status({ port: 4918 }) });
  page();
  await screen.findByRole('button', { name: english.stopSharing });

  // Nothing is held and nothing is asked while no close has arrived: the close
  // button is the window's own business, and this side has not been told
  // otherwise.
  expect(question()).toBeNull();
  expect(invoke).not.toHaveBeenCalledWith('close_window');

  await theBackendAsks();
  expect(
    await screen.findByRole('dialog', { name: english.shareCloseQuestion }),
  ).toBeTruthy();
  // Asked, and nothing done yet: the service is still serving and the window is
  // still here, because the user has not answered.
  expect(invoke).not.toHaveBeenCalledWith('close_window');

  fireEvent.click(
    screen.getByRole('button', { name: english.shareCloseConfirm }),
  );
  // One command, and not a stop followed by a close: what the user answered was
  // one thing, and the backend is the side that can do both — it ends the
  // service and then closes the window it decided to hold. Nothing here reaches
  // for the window at all, so nothing here needs a permission over it.
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('close_window'));
  expect(invoke).not.toHaveBeenCalledWith('close_share');
});

it('stays open when the question is answered no', async () => {
  backend(invoke, { share_status: status({ port: 4918 }) });
  page();
  await screen.findByRole('button', { name: english.stopSharing });

  await theBackendAsks();
  fireEvent.click(await screen.findByRole('button', { name: english.cancel }));

  // The window stays and the service keeps running, which is what saying no
  // means — and it is not a state the user is stuck in: the next close is asked
  // again.
  expect(question()).toBeNull();
  expect(invoke).not.toHaveBeenCalledWith('close_window');
  await theBackendAsks();
  expect(question()).toBeTruthy();
});

it('does not put the question a second time while the answer is on its way', async () => {
  // A close arriving while the window is already being closed is the same
  // question, and the same answer is being carried out: reopening it would put
  // a dialog in front of a close that is happening.
  backend(invoke, { share_status: status({ port: 4918 }) });
  page();
  await screen.findByRole('button', { name: english.stopSharing });

  await theBackendAsks();
  fireEvent.click(
    screen.getByRole('button', { name: english.shareCloseConfirm }),
  );
  await theBackendAsks();
  expect(question()).toBeNull();
});

it('says so when the window could not be closed', async () => {
  // The one failure the user is entitled to hear about rather than be left
  // pressing a button that does nothing. Reported in the same place every other
  // failure of this surface is.
  vi.mocked(invoke).mockImplementation((async (command: string) => {
    if (command === 'share_status') return status({ port: 4918 });
    throw { code: 'app.close.failed', params: {}, errorId: 'err_test' };
  }) as never);
  page();
  await screen.findByRole('button', { name: english.stopSharing });

  await theBackendAsks();
  fireEvent.click(
    screen.getByRole('button', { name: english.shareCloseConfirm }),
  );
  expect(await screen.findByText(english.operationFailed)).toBeTruthy();
  expect(screen.getByText(errors['app.close.failed'])).toBeTruthy();
});
