import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ScanStatus } from '../../shared/api';
import { PageFrame } from './PageFrame';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();

const { library } = vi.hoisted(() => {
  const library = {
    completion: null as ScanStatus | null,
    scan: { data: undefined as ScanStatus | undefined },
    error: null,
    dismissCompletion: vi.fn(),
    retryError: undefined as (() => Promise<unknown>) | undefined,
    setError: vi.fn(),
    controlScan: vi.fn(async () => {}),
  };
  return { library };
});

vi.mock('./LibraryProvider', () => ({
  useLibraryContext: () => library,
}));

const completed: ScanStatus = {
  background: false,
  phase: 'complete',
  failures: 0,
  unreachableDirectories: 0,
  changes: { added: 0, updated: 0, removed: 0 },
  discovered: 0,
  processed: 0,
  indexed: 0,
  metadataReady: 0,
  thumbnailsReady: 0,
  currentPath: '',
};

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  library.completion = null;
  library.scan.data = undefined;
});

afterEach(cleanup);

function page() {
  return (
    <I18nextProvider i18n={i18n}>
      <PageFrame>
        <div />
      </PageFrame>
    </I18nextProvider>
  );
}

it('reports how many folders the scan could not reach', () => {
  library.completion = { ...completed, unreachableDirectories: 2 };
  render(page());
  expect(screen.getByText(/2 folders are currently unreachable/)).toBeTruthy();
});

it('leaves unreachable folders out of a completion that reached them all', () => {
  library.completion = { ...completed };
  render(page());
  expect(screen.queryByText(/folders are currently unreachable/)).toBeNull();
});
