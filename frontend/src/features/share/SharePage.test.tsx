// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import * as doubles from '../../test/doubles';
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
import { invoke } from '@tauri-apps/api/core';
import { ShareProvider } from './ShareProvider';
import { SharePage } from '../../pages/SharePage';
import english from '../../../../shared/locales/en/common.json';
import errors from '../../../../shared/locales/en/errors.json';
import type { Address, Device, ShareStatus } from '../../shared/api';

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
    devices: [],
    addresses: [],
    ...overrides,
  };
}

/** An address this machine would be reached at. */
function address(overrides: Partial<Address> = {}): Address {
  return {
    interface: 'Wi-Fi',
    address: '192.168.1.5',
    loopback: false,
    ...overrides,
  };
}

/** A client the backend has heard from, at a moment the test chooses. */
function device(overrides: Partial<Device> = {}): Device {
  return {
    address: '192.168.1.24',
    name: 'Infuse/7.6.4',
    lastSeen: Date.now(),
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
  vi.useRealTimers();
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
  // The port the backend ended up on, and not the one it was asked for: this
  // test answers with 4918 through a fixture and a different one through the
  // status, and what is on screen is the one the service is really on.
  expect(
    screen.getByText(english.sharingOn.replace('{{port}}', '4918')),
  ).toBeTruthy();
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
      params: { port: '4918', count: '10' },
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
    screen.getByText(
      errors['share.port.in_use']
        .replace('{{port}}', '4918')
        .replace('{{count}}', '10'),
    ),
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

it('shows the address the service is really on, and copies it', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  setClipboard(writeText);
  backend({
    // A port other than the one the service asks for, which is what the
    // interface has to be able to show: the address it offers is the one that
    // works, and 4918 is what was wanted rather than what was taken.
    share_status: status({ port: 4919, addresses: [address()] }),
  });
  page();
  // The address and the port together, in the spelling a client is given: the
  // trailing slash is how the protocol says this is a collection to browse.
  const url = 'http://192.168.1.5:4919/';
  expect(await screen.findByText(url)).toBeTruthy();
  expect(
    screen.getByText(english.sharingOn.replace('{{port}}', '4919')),
  ).toBeTruthy();
  // The interface name is what tells two plausible-looking addresses apart on a
  // machine with a virtual adapter.
  expect(screen.getByText('Wi-Fi')).toBeTruthy();

  fireEvent.click(
    screen.getByRole('button', { name: `${english.copyAddress}: ${url}` }),
  );
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
  expect(notices.setError).not.toHaveBeenCalled();
});

it('marks the address that cannot reach a television', async () => {
  backend({
    share_status: status({
      port: 4918,
      addresses: [
        address(),
        address({
          interface: 'Loopback',
          address: '127.0.0.1',
          loopback: true,
        }),
      ],
    }),
  });
  page();
  const rows = await screen.findAllByRole('listitem');
  // The order is the backend's, and the mark is on the last row: the machine
  // talking to itself, which a user copying down the list would be most likely
  // to take by mistake.
  expect(rows[0].textContent).toContain('192.168.1.5');
  expect(rows[0].textContent).not.toContain(english.addressLoopback);
  expect(rows[1].textContent).toContain('http://127.0.0.1:4918/');
  expect(rows[1].textContent).toContain(english.addressLoopback);
});

it('says what to do instead of showing addresses while nothing is running', async () => {
  backend({ share_status: status({ addresses: [address()] }) });
  page();
  // Nothing is running, so there is no port to put on an address: the block
  // explains itself rather than listing addresses that lead nowhere.
  expect(await screen.findByText(english.connectionIdle)).toBeTruthy();
  expect(screen.queryByText('http://192.168.1.5:4918/')).toBeNull();
  // And the credentials are there anyway, which is the reason the block is
  // drawn at all in this state: a user can set the television up first.
  expect(screen.getByText('enjoy')).toBeTruthy();
});

it('says so when the machine has no address to offer', async () => {
  backend({ share_status: status({ port: 4918, addresses: [] }) });
  page();
  // Every adapter down: a heading with nothing under it is the one thing this
  // block must not be.
  expect(await screen.findByText(english.connectionNoAddress)).toBeTruthy();
});

it('lists the devices that have asked for something, and how long ago', async () => {
  backend({
    share_status: status({
      port: 4918,
      // In the order the backend hands them over, most recently heard from
      // first: the page draws the list rather than sorting it, and the sort is
      // the backend's — it is the one that knows when each request arrived.
      devices: [
        device({ address: '192.168.1.31', name: null, lastSeen: Date.now() }),
        device({ lastSeen: Date.now() - 12_000 }),
      ],
    }),
  });
  page();
  // The name the client gave, the address it came from, and the moment it was
  // last heard from. The list is most-recent-first, so the client that has just
  // been here is the row above the one that has been quiet for twelve seconds.
  const rows = await screen.findAllByRole('listitem');
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toContain('192.168.1.31');
  // A second and not two: the singular is what the backend's own answer of
  // "just now" reads as, and it is the only count that has a form of its own.
  expect(rows[0].textContent).toContain(
    english.activeAgo_one.replace('{{countText}}', '1'),
  );
  expect(rows[1].textContent).toContain('Infuse/7.6.4');
  expect(rows[1].textContent).toContain('192.168.1.24');
  expect(rows[1].textContent).toContain(
    english.activeAgo_other.replace('{{countText}}', '12'),
  );
  // A client that did not name itself is still a row, under the word for not
  // knowing: a blank there would read as a device that failed to arrive.
  expect(rows[0].textContent).toContain(english.unknown);
});

it('says the list is empty when no device has asked', async () => {
  backend({ share_status: status({ port: 4918 }) });
  page();
  // The wording and not just the absence: the list is drawn only while the
  // service is running, so an empty one is a fact about the last minute rather
  // than a section that has not loaded.
  expect(await screen.findByText(english.devicesEmpty)).toBeTruthy();
  expect(screen.getByText(english.devicesHelp)).toBeTruthy();
});

it('reads the list again on its own, so a device appears and drops off', async () => {
  // The criterion is that neither arrival nor departure needs the user to do
  // anything, and the only way to see that is to run the clock: nothing pushes
  // either event, so what the page does with a quiet five seconds is the whole
  // of the feature.
  vi.useFakeTimers();
  let answer = status({ port: 4918 });
  vi.mocked(invoke).mockImplementation((async (command: string) => {
    if (command === 'share_status') return answer;
    throw { code: 'app.unexpected', errorId: 'test' };
  }) as never);
  page();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText(english.devicesEmpty)).toBeTruthy();

  // A device that was not there a moment ago, and the page hears about it
  // without anyone touching it.
  answer = status({ port: 4918, devices: [device()] });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(screen.getByText('Infuse/7.6.4')).toBeTruthy();
  expect(screen.queryByText(english.devicesEmpty)).toBeNull();

  // And gone again once the backend stops counting it among the recent.
  answer = status({ port: 4918 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(screen.getByText(english.devicesEmpty)).toBeTruthy();
});
