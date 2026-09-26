import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ScanStatus } from '../../shared/api';
import { idleScan } from '../../test/fixtures';
import { PageFrame } from './PageFrame';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();

const { library } = vi.hoisted(() => {
  const library = {
    completion: null as ScanStatus | null,
    scan: { data: undefined as ScanStatus | undefined },
    error: null,
    dismissCompletion: vi.fn(),
    copyHint: false,
    dismissCopyHint: vi.fn(),
    retryError: undefined as (() => Promise<unknown>) | undefined,
    setError: vi.fn(),
    controlScan: vi.fn(async () => {}),
  };
  return { library };
});

vi.mock('./LibraryProvider', () => ({
  useLibraryContext: () => library,
}));

const completed = idleScan({ phase: 'complete' });

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  library.completion = null;
  library.copyHint = false;
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

it('leaves a completion notice alone, because a hint is not a notice', () => {
  library.dismissCompletion.mockClear();
  library.completion = { ...completed };
  const { rerender } = render(page());
  expect(screen.getByText(english.scanComplete)).toBeTruthy();
  library.copyHint = true;
  rerender(page());
  // A hint does not register for the single non-error slot, so the completion
  // it appears beside keeps its place instead of being closed.
  expect(library.dismissCompletion).not.toHaveBeenCalled();
  expect(screen.getByText(english.copied)).toBeTruthy();
  expect(screen.getByText(english.scanComplete)).toBeTruthy();
});

it('announces a copied path once it was copied, and not before', () => {
  const { rerender } = render(page());
  expect(screen.queryByText(english.copied)).toBeNull();
  library.copyHint = true;
  rerender(page());
  expect(screen.getByText(english.copied)).toBeTruthy();
});
