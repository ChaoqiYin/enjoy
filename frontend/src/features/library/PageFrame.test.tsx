// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import * as doubles from '../../test/doubles';
import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { idleScan } from '../../test/fixtures';
import { PageFrame } from './PageFrame';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();

// Two doubles, one per module the frame reads, rather than one stand-in for the
// whole library: what the frame depends on is the notices and the scan, and a
// test that had to name the other twenty-six keys would be describing a
// relationship the component does not have. Each is built from the slice's own
// type, so a key those slices grow is a compile error in `doubles` rather than
// something this frame's test would not notice.
//
// The dismissal is handed in as the test's own mock: the slice's type says it
// is a function, which is all a caller needs to know and not enough to assert
// that it was not called.
const dismissCompletion = vi.fn();
const notices = doubles.notices({ dismissCompletion });
const scan = doubles.scan();

vi.mock('./useNotices', () => ({ useNotices: () => notices }));
vi.mock('./useScan', () => ({ useScan: () => scan }));

const completed = idleScan({ phase: 'complete' });

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  notices.completion = null;
  notices.copyHint = false;
  notices.error = null;
  scan.status = undefined;
  scan.isRunning = false;
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
  notices.completion = { ...completed, unreachableDirectories: 2 };
  render(page());
  expect(screen.getByText(/2 folders are currently unreachable/)).toBeTruthy();
});

it('leaves unreachable folders out of a completion that reached them all', () => {
  notices.completion = { ...completed };
  render(page());
  expect(screen.queryByText(/folders are currently unreachable/)).toBeNull();
});

it('leaves a completion notice alone, because a hint is not a notice', () => {
  dismissCompletion.mockClear();
  notices.completion = { ...completed };
  const { rerender } = render(page());
  expect(screen.getByText(english.scanComplete)).toBeTruthy();
  notices.copyHint = true;
  rerender(page());
  // A hint does not register for the single non-error slot, so the completion
  // it appears beside keeps its place instead of being closed.
  expect(dismissCompletion).not.toHaveBeenCalled();
  expect(screen.getByText(english.copied)).toBeTruthy();
  expect(screen.getByText(english.scanComplete)).toBeTruthy();
});

it('announces a copied path once it was copied, and not before', () => {
  const { rerender } = render(page());
  expect(screen.queryByText(english.copied)).toBeNull();
  notices.copyHint = true;
  rerender(page());
  expect(screen.getByText(english.copied)).toBeTruthy();
});
