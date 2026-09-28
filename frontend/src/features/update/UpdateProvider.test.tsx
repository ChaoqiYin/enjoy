// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import * as doubles from '../../test/doubles';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { UpdateProvider, useUpdateContext } from './UpdateProvider';
import english from '../../../../shared/locales/en/common.json';
import errors from '../../../../shared/locales/en/errors.json';

// What this provider asks of the library: whether a media task is holding the
// slot. Built from the scan slice's own type rather than written out as the one
// key this test happens to read — the provider reads `isRunning`, and a slice
// whose other two keys moved out from under it is not something this test
// should have to notice on its own.
const scan = doubles.scan();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  convertFileSrc: (path: string) => path,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('../library/useScan', () => ({ useScan: () => scan }));

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    resources: { en: { translation: english, errors } },
  });
  vi.mocked(listen).mockResolvedValue(vi.fn() as never);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

/** Stands in for the settings section's button, the only thing that checks. */
function Trigger() {
  const update = useUpdateContext();
  return <button onClick={() => void update.checkNow()}>check</button>;
}

function view() {
  return (
    <I18nextProvider i18n={i18n}>
      <UpdateProvider>
        <Trigger />
      </UpdateProvider>
    </I18nextProvider>
  );
}

it('leaves the check to the settings button', async () => {
  // Checking is the user's to start: opening the app must not ask the release
  // endpoint anything, so nothing is invoked on mount.
  render(view());
  // The event channel is the hook's own setup; waiting on it proves the
  // provider mounted before this assertion is read.
  await waitFor(() => expect(listen).toHaveBeenCalled());
  expect(invoke).not.toHaveBeenCalled();
});

it('offers the restart once the download is verified', async () => {
  vi.mocked(invoke).mockResolvedValue({
    supported: true,
    currentVersion: '0.1.0',
    available: {
      version: '0.2.0',
      currentVersion: '0.1.0',
      notes: null,
      date: null,
    },
    readyToRestart: true,
  });
  render(view());
  fireEvent.click(screen.getByRole('button', { name: 'check' }));
  await waitFor(() =>
    expect(screen.getByText(english.updateReadyTitle)).toBeTruthy(),
  );
});

it('answers a check that found nothing with a notice', async () => {
  // The settings section writes no outcome into itself, so this is where the
  // user learns the installed version is the latest.
  vi.mocked(invoke).mockResolvedValue({
    supported: true,
    currentVersion: '0.1.0',
    available: null,
    readyToRestart: false,
  });
  render(view());
  fireEvent.click(screen.getByRole('button', { name: 'check' }));
  await waitFor(() =>
    expect(screen.getByText(english.updateUpToDate)).toBeTruthy(),
  );
});

it('answers a platform without published updates with a notice', async () => {
  vi.mocked(invoke).mockResolvedValue({
    supported: false,
    currentVersion: '0.1.0',
    available: null,
    readyToRestart: false,
  });
  render(view());
  fireEvent.click(screen.getByRole('button', { name: 'check' }));
  await waitFor(() =>
    expect(screen.getByText(english.updateUnsupported)).toBeTruthy(),
  );
});
