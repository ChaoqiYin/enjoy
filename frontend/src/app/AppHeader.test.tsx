// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import * as doubles from '../test/doubles';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppHeader } from './AppHeader';
import { PluginHostProvider } from '../plugins/PluginHostProvider';
import type { PluginContext } from '../plugins/host';
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

/** A plugin interface that registers one page of its own. */
async function loader() {
  return {
    default: (_baseline: unknown, pluginContext: PluginContext) => {
      pluginContext.draw('app.page', {
        key: 'covers',
        label: 'Covers',
        draw: () => null,
      });
    },
  };
}

function header(path = '/', loadEntry = loader) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        {/* The row carries the pages plugins registered, so the header is
            rendered inside the host that loads them — the same place the app
            puts it. */}
        <PluginHostProvider
          port={{
            bootstrap: async () => [
              {
                id: 'a-plugin',
                name: 'A plugin',
                author: 'someone',
                capabilities: [],
                enabled: true,
                entry: 'a/interface.js',
                hasBody: false,
                failure: null,
              },
            ],
            setEnabled: async () => [],
            setOrder: async () => [],
            preview: async () => {
              throw new Error('unused');
            },
            install: async () => [],
            uninstall: async () => [],
            contentRows: async () => 0,
            safeMode: async () => [],
            settings: async () => [],
            saveSettings: async () => [],
          }}
          loadEntry={loadEntry}
        >
          <AppHeader />
        </PluginHostProvider>
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
  english.tasks,
  english.plugins,
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

it('gives every entry an icon that stays out of its name', () => {
  header();
  // The prototype's header is words alone, so the icons are an addition (ADR
  // 0024). What has to hold either way is that they are decoration: an icon
  // carrying a name of its own would be read into the entry's accessible name,
  // and these entries are found by that name — here and in `routes.test.tsx`,
  // which drives the whole app by clicking them.
  for (const label of entries) {
    const entry = navEntry(label);
    expect(entry.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1);
    expect(entry.textContent).toBe(label);
  }
});

it('turns the words of every entry a character at a time', () => {
  header();
  // jsdom runs no animation and computes no styles, so what is pinned here is
  // the declaration and not the movement: one span per drawn character, each
  // asking for the turn under the hover variant alone, with delays that step
  // forward and finish quickly. That the characters then really turn is the
  // browser's half of the bargain — the same split `interface.test.tsx` draws,
  // and ADR 0027 holds the measurements.
  //
  // The reduced-motion branch is not here either, and not because it was
  // forgotten: `useReducedMotion` reads the preference once into a module-level
  // variable the first time any hook asks for it, so a stub installed inside a
  // test is read too late — the value was settled by the first render in this
  // file. It is checked the way the rest of the app's reduced-motion branches
  // are, by running the real engine with the preference forced on.
  for (const label of entries) {
    const words = navEntry(label).querySelector<HTMLElement>('.nav-words');
    const chars = Array.from(
      words?.querySelectorAll<HTMLElement>('.nav-char') ?? [],
    );
    expect(words?.textContent).toBe(label);
    // The spaces are pieces too and are left as text, so they are not counted
    // and not drawn: the characters alone spell the label with no gaps in it.
    expect(chars.map((char) => char.textContent).join('')).toBe(
      label.replace(/\s/g, ''),
    );

    const delays = chars.map((char) => {
      expect(char.classList.contains('group-hover:animate-nav-turn')).toBe(
        true,
      );
      return parseFloat(char.style.animationDelay);
    });
    // Non-decreasing, and stepped by no more than the gap: not `previous + 30`
    // for every pair, because a space sitting between two characters is skipped
    // by the count — the assertions would fail on the one English label that
    // has one, which is exactly the label they are here for.
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    delays.forEach((delay, i) => {
      if (i > 0) expect(delay - delays[i - 1]).toBeLessThanOrEqual(30);
    });
    expect(delays.at(-1)).toBeLessThanOrEqual(240);
  }
});

it('carries the pages plugins added, after the interface own seven', async () => {
  // The row is the render side of `app.page`: a page a plugin registered is
  // reached from here and from nowhere else, and it is named in the plugin's
  // own words rather than in a translation the kernel does not have.
  header();
  const pluginEntry = await screen.findByRole('tab', { name: 'Covers' });
  expect(pluginEntry.getAttribute('href')).toBe('/plugins/a-plugin/covers');
  const row = screen
    .getAllByRole('tab')
    .map((entry) => entry.getAttribute('aria-label'));
  expect(row.slice(0, 7)).toEqual(entries);
  expect(row.at(-1)).toBe('Covers');
});

it('names the navigation for a reader that cannot see the row', () => {
  header();
  expect(screen.getByRole('navigation').getAttribute('aria-label')).toBe(
    english.nav,
  );
});

it('keeps the entries out of the keyboard order, and draws no ring on them', () => {
  header();
  // The row is the mouse's way in. Radix focuses an entry from `mousedown` and
  // Chromium reads a script's `focus()` as keyboard focus, so the ring the
  // primitive wears for the keyboard is painted on every click — a keyboard
  // marker raised by the pointer. Two things keep it off, and they are not the
  // two a first reading expects: a strip's tab stop is the **list**, not any
  // entry (every trigger is `tabIndex={-1}` on its own), so the `-1` that
  // keeps the keyboard out lives on the tablist; and the ring is merged away in
  // `TabsTrigger`'s `className`. The cost — the keyboard cannot reach the row —
  // is a decision `MainNav` states outright rather than a side effect, and this
  // is where it is held to: a ring or a tab stop cannot come back unnoticed.
  expect(screen.getByRole('tablist').tabIndex).toBe(-1);
  const entry = navEntry(english.history);
  expect(entry.classList.contains('focus-visible:ring-2')).toBe(false);
  expect(entry.classList.contains('focus-visible:ring-offset-2')).toBe(false);
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

it('says where the service is on the prompt, rather than repeating that it is up', () => {
  share.port = 4918;
  header();
  const pill = screen.getByRole('status', { name: english.lanOnline });
  // The pointer's question is a different one from the reader's: where the
  // service is, not whether it is up. So the prompt carries the port and the
  // pill still carries its own name — the prompt does not repeat 「在线」.
  vi.useFakeTimers();
  try {
    fireEvent.pointerMove(pill);
    act(() => vi.runAllTimers());
    expect(screen.getByRole('tooltip').textContent).toBe(
      i18n.t('sharingOn', { port: 4918 }),
    );
  } finally {
    vi.useRealTimers();
  }
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
