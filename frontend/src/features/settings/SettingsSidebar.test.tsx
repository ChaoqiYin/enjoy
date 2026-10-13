import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsSidebar, type SettingsEntry } from './SettingsSidebar';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    resources: { en: { translation: english } },
  });
});
afterEach(cleanup);

/** A class that asks for a foreground colour under the pointer. The rule itself
 *  is held repo-wide by `scripts/check-tokens.mjs`; this pins the one control
 *  the ticket was written about (ADR 0038). */
const pointerForegrounds = (el: Element) =>
  Array.from(el.classList).filter((name) =>
    /(hover|focus)[^:]*:text-/.test(name),
  );

const items: SettingsEntry[] = [
  {
    value: 'general',
    label: 'General',
    children: [
      { value: 'appearance', label: 'Appearance' },
      { value: 'spaces', label: 'Spaces' },
    ],
  },
  { value: 'folders', label: 'Video folders', badge: 2 },
];

function view(value = 'appearance', onSelect = vi.fn()) {
  return render(
    <I18nextProvider i18n={i18n}>
      <SettingsSidebar items={items} value={value} onSelect={onSelect} />
    </I18nextProvider>,
  );
}

function row(name: string | RegExp) {
  return screen.getByRole('button', { name });
}

it('names the rail, and offers a row for every entry and every one under it', () => {
  view();
  // Named, because a rail of choices with no name is one more anonymous list to
  // a reader walking the page. It is a list rather than a landmark: the page's
  // one `navigation` is the header's, and `app/routes.test.tsx` holds it to
  // being the only one.
  expect(screen.getByRole('list', { name: english.settings })).toBeTruthy();
  expect(screen.getAllByRole('button')).toHaveLength(4);
});

it('says which entry is open, and which of its children is the one on screen', () => {
  view('appearance');
  expect(row('General').getAttribute('aria-expanded')).toBe('true');
  expect(row('Appearance').getAttribute('aria-current')).toBe('true');
  expect(row('Spaces').getAttribute('aria-current')).toBeNull();
});

it('opens and closes an entry that has children', () => {
  view();
  const general = row('General');
  fireEvent.click(general);
  expect(general.getAttribute('aria-expanded')).toBe('false');
  // The rows under it go with it: there is no fold holding them at zero height
  // any more, so a closed entry has nothing in the list at all.
  expect(screen.queryByRole('button', { name: 'Appearance' })).toBeNull();
  fireEvent.click(general);
  expect(general.getAttribute('aria-expanded')).toBe('true');
  expect(row('Appearance')).toBeTruthy();
});

/** The current row stays filled and legible while the pointer is over it: the
 *  fill asks for the row only while it is current, and the wash only while it
 *  is not, so which one wins is settled by the row's own state rather than by
 *  the order the two rules come out in (ADR 0038). Light mode is where the two
 *  colours part company, and where the ungated pair drew a grey block over the
 *  red one. */
it('keeps the current row filled under the pointer', () => {
  view('appearance');
  const current = row('Appearance');
  const spare = row('Spaces');

  expect(current.getAttribute('data-active')).toBe('true');
  expect(current.classList.contains('data-[active=true]:bg-selection')).toBe(
    true,
  );
  expect(spare.getAttribute('data-active')).toBe('false');
  expect(
    spare.classList.contains('data-[active=false]:hover:bg-sidebar-accent'),
  ).toBe(true);
  expect(pointerForegrounds(current)).toEqual([]);
  expect(pointerForegrounds(spare)).toEqual([]);
});

/** The badge took the row's hover colour by name — `peer-hover/menu-button:
 *  text-sidebar-accent-foreground` — which is a foreground colour written by
 *  the pointer, so it was removed rather than gated. The badge still follows
 *  the row into the current state; that half is not the pointer's doing and
 *  stays (ADR 0038). */
it('leaves the count of a row out of the pointer’s reach', () => {
  view('appearance');
  const badge = screen.getByText('2');

  expect(pointerForegrounds(badge)).toEqual([]);
  expect(
    badge.classList.contains(
      'peer-data-[active=true]/menu-button:text-selection-foreground',
    ),
  ).toBe(true);
});

it('hands back the child that was pressed', () => {
  const onSelect = vi.fn();
  view('appearance', onSelect);
  fireEvent.click(row('Spaces'));
  expect(onSelect).toHaveBeenCalledWith('spaces');
});

it('hands back an entry that has nothing under it, from the same press', () => {
  const onSelect = vi.fn();
  view('appearance', onSelect);
  fireEvent.click(row('Video folders'));
  expect(onSelect).toHaveBeenCalledWith('folders');
});

it('says what an entry has to report about itself', () => {
  view();
  // The count sits beside the row rather than inside it, so the control's name
  // is the label alone and the count is met walking the item.
  const folders = row('Video folders');
  expect(folders.textContent).toBe('Video folders');
  expect(folders.parentElement?.textContent).toContain('2');
});

// The keyboard is the part that changed shape when the rail stopped being the
// vendored menu, so it is the part worth holding: that menu kept one tab stop
// for the whole rail and walked it with the arrow keys. shadcn's model is the
// plain one — one button per row, every one of them tabbable, the focus ring as
// the only marker — and `app/routes.test.tsx` presses these rows by name.
it('gives every row its own turn at the tab key', () => {
  view();
  for (const name of ['General', 'Appearance', 'Spaces', 'Video folders'])
    expect(row(name).tabIndex).toBe(0);
});

it('adds no second landmark to the page', () => {
  view();
  // `app/routes.test.tsx` holds `getByRole('navigation')` to being the header's
  // alone, and a `nav` here would break it from a distance.
  expect(screen.queryByRole('navigation')).toBeNull();
});
