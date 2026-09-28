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
  setClipboard,
  status,
  videoActions,
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
import errors from '../../../../shared/locales/en/errors.json';

/**
 * The password, and the one thing about it that can be out of date: a service
 * that is running behind a password that has since been replaced.
 *
 * Split from the page's own file, which is about the page, when that file came
 * up against the 500-line limit — the same reason the provider's tests were
 * split off before it. Everything here is a page-level fact, and the split is
 * by subject rather than by kind.
 */
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
    destroy: () => windowMock.destroy(),
  }),
}));
vi.mock('../library/useVideos', () => ({ useVideos: () => library }));
// The cards in the 共享清单 act through the library's own actions, which is a
// slice with its own tests; what this file is about is the password block.
vi.mock('../library/useVideoActions', () => ({
  useVideoActions: () => videoActions,
}));
vi.mock('../library/useBusy', () => ({ useBusy: () => busy }));
vi.mock('../library/useScan', () => ({ useScan: () => scan }));
vi.mock('../library/useNotices', () => ({ useNotices: () => notices }));
// The page reads the current space to name it when starting the service. What
// the space *is* belongs to the space provider's own tests; what this file is
// about is which space the command was told.
vi.mock('../space/SpaceProvider', () => ({
  useSpace: () => ({ id: 7, name: 'Acceptance' }),
}));

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english, errors } },
  });
  resetSharePage(invoke);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window.navigator as { clipboard?: unknown }).clipboard;
});

/** The page, with the provider above it and a router: the page links back to
 *  the library when there is nothing on the list. */
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

it('shows what to connect with before anything has been started', async () => {
  backend(invoke, { share_status: status({ password: 'clipper12345' }) });
  page();
  // The user name a device signs in with, and the password it is drawn, both
  // readable before the port is open: a password that only appeared once the
  // service was running would be one nobody could write down first.
  expect(await screen.findByText('enjoy')).toBeTruthy();
  // Masked until asked for, and the mask is not the password.
  const hidden = screen.getByRole('button', { name: english.showPassword });
  expect(hidden.getAttribute('aria-pressed')).toBe('false');
  expect(screen.queryByText('clipper12345')).toBeNull();

  fireEvent.click(hidden);
  expect(screen.getByText('clipper12345')).toBeTruthy();
  const shown = screen.getByRole('button', { name: english.hidePassword });
  expect(shown.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(shown);
  expect(screen.queryByText('clipper12345')).toBeNull();
});

it('copies the password, and says so', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  setClipboard(writeText);
  backend(invoke, { share_status: status({ password: 'clipper12345' }) });
  page();
  fireEvent.click(
    await screen.findByRole('button', { name: english.copyPassword }),
  );
  // The password and not what is on screen: the button is there precisely for
  // the user who has not asked to see it.
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('clipper12345'));
  expect(notices.showCopyHint).toHaveBeenCalled();
  expect(notices.setError).not.toHaveBeenCalled();
});

it('says a running service is behind a password that has been replaced', async () => {
  backend(invoke, {
    share_status: status({ port: 4918, password: 'clipper12345' }),
    // What the backend answers after the press: a new password, and a service
    // that is still checking the old one.
    regenerate_share_password: status({
      port: 4918,
      password: 'doubloons6789',
      needsRestart: true,
    }),
  });
  page();
  fireEvent.click(
    await screen.findByRole('button', { name: english.regeneratePassword }),
  );
  // The space travels with it like every other space-scoped call: the answer is
  // the whole status, and part of that status is whether the running service is
  // still offering the list that space holds now.
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('regenerate_share_password', {
      spaceId: 7,
    }),
  );
  // The new password is shown at once — it is the one the user needs after they
  // do what the warning says — and the warning is what tells them the running
  // service does not take it yet.
  expect(await screen.findByText(english.passwordRestartNeeded)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: english.showPassword }));
  expect(screen.getByText('doubloons6789')).toBeTruthy();
});
