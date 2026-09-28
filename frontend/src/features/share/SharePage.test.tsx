// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import * as doubles from '../../test/doubles';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { ShareProvider } from './ShareProvider';
import { SharePage } from '../../pages/SharePage';
import english from '../../../../shared/locales/en/common.json';
import errors from '../../../../shared/locales/en/errors.json';
import type { ShareStatus } from '../../shared/api';

// The chrome the page sits in asks the library two things — whether a pass is
// running, and what the library has to say. Neither is what this file is about,
// and both come from the slices' own declarations.
const scan = doubles.scan();
const notices = doubles.notices();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  convertFileSrc: (path: string) => path,
}));
vi.mock('../library/useScan', () => ({ useScan: () => scan }));
vi.mock('../library/useNotices', () => ({ useNotices: () => notices }));
// The page reads the current space to name it when starting the service. What
// the space *is* belongs to the space provider's own tests; what this file is
// about is which space the command was told.
vi.mock('../space/SpaceProvider', () => ({
  useSpace: () => ({ id: 7, name: 'Acceptance' }),
}));

const i18n = createInstance();

/**
 * What the backend would answer, one command at a time. The port is the
 * backend's to choose, so a test that named it in the interface would be
 * testing the wrong side of the seam: this hands back one the interface never
 * asked for.
 */
function backend(answers: Partial<Record<string, ShareStatus>>) {
  vi.mocked(invoke).mockImplementation((async (command: string) => {
    const answer = answers[command];
    if (!answer) throw { code: 'app.unexpected', errorId: 'test' };
    return answer;
  }) as never);
}

/**
 * The status the backend would answer with, with everything the test is not
 * about left as it is when nothing has been started.
 *
 * The credentials are the backend's, drawn by it and never by the interface, so
 * a test names what it wants to see on screen rather than a value the interface
 * would have had to invent.
 */
function status(overrides: Partial<ShareStatus> = {}): ShareStatus {
  return {
    port: null,
    missingFiles: 0,
    username: 'enjoy',
    password: 'sample-passw0rd',
    needsRestart: false,
    ...overrides,
  };
}

/** The clipboard the page copies a password to. */
function setClipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english, errors } },
  });
  vi.mocked(invoke).mockReset();
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
  vi.unstubAllGlobals();
  delete (window.navigator as { clipboard?: unknown }).clipboard;
});

function page() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ShareProvider>
        <SharePage />
      </ShareProvider>
    </I18nextProvider>,
  );
}

it('offers to start the service, and shows the port it ended up on', async () => {
  backend({
    share_status: status(),
    open_share: status({ port: 4918 }),
  });
  page();
  const start = await screen.findByRole('button', {
    name: english.startSharing,
  });
  fireEvent.click(start);

  // The space travels with the command: the backend offers one space's 共享清单
  // and cannot know which one is on screen.
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('open_share', { spaceId: 7 }),
  );
  // The state follows the answer, not the request: the button turns into the
  // one that ends the service only once the backend has said one is running.
  expect(
    await screen.findByRole('button', { name: english.stopSharing }),
  ).toBeTruthy();
  expect(screen.getByText(english.sharingOn)).toBeTruthy();
});

it('ends a service that is running', async () => {
  backend({
    share_status: status({ port: 4918 }),
    close_share: status(),
  });
  page();
  const stop = await screen.findByRole('button', { name: english.stopSharing });
  fireEvent.click(stop);

  await waitFor(() => expect(invoke).toHaveBeenCalledWith('close_share'));
  expect(
    await screen.findByRole('button', { name: english.startSharing }),
  ).toBeTruthy();
});

it('says so, beside the reference, when the service cannot start', async () => {
  vi.mocked(invoke).mockImplementation((async (command: string) => {
    if (command === 'share_status') return status();
    throw {
      code: 'share.port.in_use',
      params: { port: '4918' },
      errorId: 'err_test',
    };
  }) as never);
  page();
  fireEvent.click(
    await screen.findByRole('button', { name: english.startSharing }),
  );
  // The failure floats, so it is readable from wherever the user has got to,
  // and it names the reference the log is searched by.
  expect(await screen.findByText(english.operationFailed)).toBeTruthy();
  expect(
    screen.getByText(errors['share.port.in_use'].replace('{{port}}', '4918')),
  ).toBeTruthy();
  // Nothing started, so the interface is still offering to start.
  expect(
    screen.getByRole('button', { name: english.startSharing }),
  ).toBeTruthy();
});

it('shows what to connect with before anything has been started', async () => {
  backend({ share_status: status({ password: 'clipper12345' }) });
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
  backend({ share_status: status({ password: 'clipper12345' }) });
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
  backend({
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
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('regenerate_share_password'),
  );
  // The new password is shown at once — it is the one the user needs after they
  // do what the warning says — and the warning is what tells them the running
  // service does not take it yet.
  expect(await screen.findByText(english.passwordRestartNeeded)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: english.showPassword }));
  expect(screen.getByText('doubloons6789')).toBeTruthy();
});
