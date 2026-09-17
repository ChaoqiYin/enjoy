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
    progress: null,
    restarting: false,
    error: null,
    startupCheck: vi.fn(),
    checkNow: vi.fn(),
    install: vi.fn(),
    restart: vi.fn(),
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

it('offers no check on a platform without published updates', () => {
  update.check = { ...update.check!, supported: false };
  render(view());
  expect(
    screen.queryByRole('button', { name: english.updateCheck }),
  ).toBeNull();
  // The version line explains why there is nothing to press.
  expect(screen.getByText(/Automatic updates are available/)).toBeTruthy();
});

it('says so when the installed version is the latest', () => {
  render(view());
  expect(screen.getByText(english.updateUpToDate)).toBeTruthy();
});

it('offers the download once a newer version is known', () => {
  update.check = { ...update.check!, available: release };
  render(view());
  expect(screen.getByText('Version 0.2.0 is available.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: english.updateDownload }));
  expect(update.install).toHaveBeenCalled();
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
