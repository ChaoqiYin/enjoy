// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import * as doubles from '../test/doubles';
import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppNavigation } from './AppNavigation';
import english from '../../../shared/locales/en/common.json';

const share = doubles.share();
// The navigation asks one thing of the library — whether a pass is running —
// and that is not what this file is about either. The space switcher beside the
// entries is its own component with its own tests, and it is left out here so
// that what is rendered is the entries.
const scan = doubles.scan();

vi.mock('../features/library/useScan', () => ({ useScan: () => scan }));
vi.mock('../features/share/ShareProvider', () => ({
  useShareContext: () => share,
}));
vi.mock('../features/space/SpaceSwitcher', () => ({
  SpaceSwitcher: () => null,
}));

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  Object.assign(share, doubles.share());
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
});

function navigation() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <AppNavigation />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

/** The 共享 tab, found by the label it always carries. */
function sharingTab() {
  return screen.getByRole('link', { name: /Sharing/ });
}

it('lights a lamp on the sharing entry while the service is running', () => {
  navigation();
  // Nothing is running, so the entry is only its label.
  expect(sharingTab().textContent).toBe(english.sharing);

  share.port = 4918;
  cleanup();
  navigation();
  // The lamp, and the words that go with it — read here as part of the entry's
  // own name, which is where a reader without the colour finds them.
  const tab = sharingTab();
  expect(tab.querySelector('.bg-success')).toBeTruthy();
  expect(tab.textContent).toContain(english.sharingIndicator);
});

it('carries the words on the lamp itself, for a pointer rather than a reader', () => {
  share.port = 4918;
  navigation();
  // The same sentence, on the element the pointer lands on: a lamp whose
  // meaning is only in the interface's vocabulary is one a user has to have
  // been told about already.
  const lamp = sharingTab().querySelector('.bg-success')!;
  expect(lamp.getAttribute('title')).toBe(english.sharingIndicator);
});

it('leaves the other entries alone while the service is running', () => {
  share.port = 4918;
  navigation();
  // The lamp says which page the service is on, so it belongs to that entry and
  // to no other: one on every tab would say nothing about any of them.
  expect(screen.getByRole('link', { name: 'Library' }).textContent).toBe(
    english.library,
  );
  expect(
    screen.getByRole('link', { name: 'Library' }).querySelector('.bg-success'),
  ).toBeNull();
});

it('takes the lamp away when the service ends', () => {
  share.port = 4918;
  navigation();
  expect(sharingTab().querySelector('.bg-success')).toBeTruthy();

  cleanup();
  share.port = null;
  navigation();
  expect(sharingTab().querySelector('.bg-success')).toBeNull();
  expect(sharingTab().textContent).toBe(english.sharing);
});
