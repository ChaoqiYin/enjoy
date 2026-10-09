import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsSidebar } from './SettingsSidebar';
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

const items = [
  { value: 'general', label: 'General' },
  { value: 'folders', label: 'Video folders', badge: '2' },
];

function view(value = 'general', onChange = vi.fn()) {
  return render(
    <I18nextProvider i18n={i18n}>
      <SettingsSidebar items={items} value={value} onChange={onChange} />
    </I18nextProvider>,
  );
}

it('names the page it switches within, and offers one entry per section', () => {
  view();
  // Named, because a rail of choices with no name is one more anonymous list to
  // a reader walking the landmarks.
  expect(screen.getByRole('tablist', { name: english.settings })).toBeTruthy();
  expect(screen.getAllByRole('tab')).toHaveLength(2);
});

it('marks the section that is on screen, and only that one', () => {
  view('folders');
  expect(
    screen
      .getByRole('tab', { name: /Video folders/ })
      .getAttribute('aria-selected'),
  ).toBe('true');
  expect(
    screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected'),
  ).toBe('false');
});

it('hands back the section that was pressed', () => {
  const onChange = vi.fn();
  view('general', onChange);
  // Radix picks a tab on pointerdown, as a browser delivers it before the
  // click; `fireEvent.click` alone never reaches the handler.
  fireEvent.mouseDown(screen.getByRole('tab', { name: /Video folders/ }), {
    button: 0,
  });
  expect(onChange).toHaveBeenCalledWith('folders');
});

it('says what an entry has to report about itself', () => {
  view();
  // The count belongs to the entry, and the entry's name is where a reader meets
  // it — it is not a second control sitting beside the label.
  expect(screen.getByRole('tab', { name: /Video folders 2/ })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'General' }).textContent).toBe(
    'General',
  );
});
