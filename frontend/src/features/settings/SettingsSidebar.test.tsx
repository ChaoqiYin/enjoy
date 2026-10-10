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
