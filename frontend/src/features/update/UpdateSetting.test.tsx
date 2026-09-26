import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UpdateSetting } from './UpdateSetting';
import english from '../../../../shared/locales/en/common.json';
import errors from '../../../../shared/locales/en/errors.json';
import type { ScanStatus } from '../../shared/api';
import type { UpdateState } from './useUpdate';

const { update, library } = vi.hoisted(() => ({
  update: {} as UpdateState,
  library: { scan: { data: undefined } } as {
    scan: { data: ScanStatus | undefined };
  },
}));

vi.mock('./UpdateProvider', () => ({
  useUpdateContext: () => update,
}));
vi.mock('../library/LibraryProvider', () => ({
  useLibraryContext: () => library,
}));

const release = {
  version: '0.2.0',
  currentVersion: '0.1.0',
  notes: 'Faster thumbnail generation.',
  date: '2026-09-01T00:00:00Z',
};

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    resources: { en: { translation: english, errors } },
  });
  library.scan = { data: undefined };
  Object.assign(update, {
    check: {
      supported: true,
      currentVersion: '0.1.0',
      available: null,
      readyToRestart: false,
    },
    checking: false,
    downloading: false,
    paused: false,
    progress: null,
    restarting: false,
    error: null,
    notice: null,
    checkNow: vi.fn(),
    install: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
    restart: vi.fn(),
    dismissNotice: vi.fn(),
    dismissError: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function view() {
  return (
    <I18nextProvider i18n={i18n}>
      <UpdateSetting />
    </I18nextProvider>
  );
}

it('keeps offering the check on a platform without published updates', () => {
  // The button is the only way to ask, so an answer of "not published here"
  // arrives as a notice rather than by taking the button away.
  update.check = { ...update.check!, supported: false };
  render(view());
  expect(
    screen.getByRole('button', { name: english.updateCheck }),
  ).toBeTruthy();
  expect(screen.queryByText(english.updateUnsupported)).toBeNull();
});

it('offers the check before any answer has arrived', () => {
  // Nothing has been asked yet, so nothing is known about this platform, and
  // the button is the only thing that can find out.
  update.check = null;
  render(view());
  expect(
    screen.getByRole('button', { name: english.updateCheck }),
  ).toBeTruthy();
});

it('writes no outcome into the section', () => {
  // "Latest" is a notice too: the section keeps one shape whatever the check
  // answered, instead of changing its wording per outcome.
  render(view());
  expect(screen.queryByText(english.updateUpToDate)).toBeNull();
});

it('offers the download once a newer version is known', () => {
  update.check = { ...update.check!, available: release };
  render(view());
  expect(screen.getByText('Version 0.2.0 is available')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: english.updateDownload }));
  expect(update.install).toHaveBeenCalled();
});

it('shows what the release contains before the download is offered', () => {
  // The notes are what the decision to download rests on, so they sit in the
  // section next to the button rather than behind a dialog.
  update.check = { ...update.check!, available: release };
  render(view());
  expect(screen.getByText(english.updateNotes)).toBeTruthy();
  expect(screen.getByText(/Faster thumbnail generation\./)).toBeTruthy();
  expect(screen.getByText(/Released/)).toBeTruthy();
});

it('keeps the release when its date is not one it can read', () => {
  // The date arrives off the network. Formatting one that cannot be parsed
  // used to throw from inside this render, and a throw that no boundary catches
  // unmounts the whole tree, so a bad date cost the entire window rather than
  // the line it belongs to.
  update.check = {
    ...update.check!,
    available: { ...release, date: '2026-09-01 00:00:00.0 +00:00:00' },
  };
  render(view());
  expect(screen.getByText(english.updateNotes)).toBeTruthy();
  expect(screen.getByText(/Faster thumbnail generation\./)).toBeTruthy();
  expect(screen.queryByText(/Released/)).toBeNull();
});

it('shows download progress while it runs', () => {
  update.check = { ...update.check!, available: release };
  update.downloading = true;
  update.progress = {
    phase: 'downloading',
    downloaded: 512,
    total: 1024,
    version: '0.2.0',
  };
  render(view());
  expect(screen.getByRole('status').textContent).toContain('512 B');
});

it('offers to pause and to cancel while the download runs', () => {
  update.check = { ...update.check!, available: release };
  update.downloading = true;
  render(view());
  fireEvent.click(screen.getByRole('button', { name: english.updatePause }));
  expect(update.pause).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: english.updateCancel }));
  expect(update.cancel).toHaveBeenCalled();
});

it('offers to continue rather than to download while paused', () => {
  // Continuing is a download started again from what was kept, so it goes
  // through the same call the first press did.
  update.check = { ...update.check!, available: release };
  update.paused = true;
  update.progress = {
    phase: 'paused',
    downloaded: 512,
    total: 1024,
    version: '0.2.0',
  };
  render(view());
  expect(screen.getByRole('status').textContent).toContain(
    english.updatePaused,
  );
  expect(
    screen.queryByRole('button', { name: english.updateDownload }),
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: english.updateResume }));
  expect(update.install).toHaveBeenCalled();
});

it('keeps how far a paused download got', () => {
  update.paused = true;
  update.progress = {
    phase: 'paused',
    downloaded: 512,
    total: 1024,
    version: '0.2.0',
  };
  render(view());
  expect(screen.getByRole('status').textContent).toContain('512 B of 1 KB');
});

it('offers the restart once the download is verified', () => {
  update.check = { ...update.check!, available: release, readyToRestart: true };
  render(view());
  fireEvent.click(screen.getByRole('button', { name: english.updateRestart }));
  expect(update.restart).toHaveBeenCalled();
});

it('does not offer a restart that a running scan would break', () => {
  // Installing exits the process, so the pass in flight would be lost. The
  // backend refuses this too; the button says why rather than looking broken.
  update.check = { ...update.check!, available: release, readyToRestart: true };
  library.scan = { data: { phase: 'processing' } as ScanStatus };
  render(view());
  const restart = screen.getByRole('button', { name: english.updateRestart });
  expect(restart.hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(english.updateRestartBlocked)).toBeTruthy();
});
