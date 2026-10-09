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
import { AppHeader } from './AppHeader';
import english from '../../../shared/locales/en/common.json';

const share = doubles.share();
// The space switcher beside the entries is its own component with its own
// tests, and it is left out here so that what is rendered is the header's own
// parts: the brand, the entries, and the lamp's words.
vi.mock('../features/space/SpaceSwitcher', () => ({
  SpaceSwitcher: () => null,
}));
// The header asks one thing of the service — whether it is running — and the
// port it is on, which is the whole of that fact.
vi.mock('../features/share/ShareProvider', () => ({
  useShareContext: () => share,
}));

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  Object.assign(share, doubles.share());
});

afterEach(cleanup);

function header(path = '/') {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <AppHeader />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

/** A navigation entry, found by the label it carries. */
function navEntry(label: string) {
  return screen.getByRole('tab', { name: label });
}

const entries = [
  english.library,
  english.favorites,
  english.history,
  english.sharing,
  english.settings,
];

it('marks the page the user is on, and only that one', () => {
  header('/favorites');
  expect(navEntry(english.favorites).getAttribute('aria-current')).toBe('page');
  expect(navEntry(english.library).getAttribute('aria-current')).toBeNull();
  expect(navEntry(english.settings).getAttribute('aria-current')).toBeNull();

  cleanup();
  header('/settings');
  expect(navEntry(english.settings).getAttribute('aria-current')).toBe('page');
  expect(navEntry(english.favorites).getAttribute('aria-current')).toBeNull();
});

it('keeps the entries links that navigate rather than action buttons', () => {
  header();
  // The guide's rule for the top navigation: a route entry keeps its link
  // semantics and does not wear the action-button styling. So every entry is
  // the anchor itself — Radix's strip styling is carried by the anchor through
  // `asChild` — and each one names where it goes.
  for (const label of entries) {
    const entry = navEntry(label);
    expect(entry.tagName).toBe('A');
    expect(entry.getAttribute('href')).toBeTruthy();
  }
});

it('names the navigation for a reader that cannot see the row', () => {
  header();
  expect(screen.getByRole('navigation').getAttribute('aria-label')).toBe(
    english.nav,
  );
});

it('paints a focus ring on the entry the keyboard lands on', () => {
  header();
  // The strip takes the browser's own outline away (`outline-none`) and shows
  // which entry is current with an underline, which says nothing about where
  // the keyboard is: the current entry and the focused one are different
  // entries. So each entry draws its own ring, the same one the buttons carry,
  // or a keyboard user cannot see where they are.
  const entry = navEntry(english.history);
  expect(entry.classList.contains('focus-visible:ring-2')).toBe(true);
  expect(entry.classList.contains('focus-visible:ring-ring')).toBe(true);
});

it('says the sharing state in words, in both states', () => {
  header();
  // Nothing is running, so the words are the ones for that.
  expect(screen.getByRole('status', { name: english.lanOffline })).toBeTruthy();

  cleanup();
  share.port = 4918;
  header();
  expect(screen.getByRole('status', { name: english.lanOnline })).toBeTruthy();
  expect(screen.queryByRole('status', { name: english.lanOffline })).toBeNull();
});

it('gives the lamp a name rather than leaving a dot to be interpreted', () => {
  share.port = 4918;
  header();
  const pill = screen.getByRole('status', { name: english.lanOnline });
  // The dot is the glance and the words are the answer: a lamp whose meaning
  // lived only in the colour would be one a user has to have been told about
  // already. So the dot is taken out of the reading, and the words are the
  // status.
  expect(pill.querySelector('[aria-hidden="true"]')).toBeTruthy();
  expect(pill.textContent).toContain(english.lanOnline);
});
