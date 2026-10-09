import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ViewModeSwitch } from './ViewModeSwitch';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

function modes({
  value = 'grid' as 'grid' | 'list' | 'table',
  onChange = vi.fn(),
  disabled,
}: {
  value?: 'grid' | 'list' | 'table';
  onChange?: (value: 'grid' | 'list' | 'table') => void;
  disabled?: boolean;
} = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ViewModeSwitch value={value} onChange={onChange} disabled={disabled} />
    </I18nextProvider>,
  );
}

it('offers the three shapes the library can be read in', () => {
  modes();
  expect(screen.getByRole('radiogroup', { name: 'View' })).toBeTruthy();
  expect(screen.getAllByRole('radio').map((item) => item.textContent)).toEqual([
    'Grid view',
    'Compact list',
    'Table view',
  ]);
});

it('marks the shape the list is being read in', () => {
  modes({ value: 'table' });
  expect(
    screen
      .getByRole('radio', { name: 'Table view' })
      .getAttribute('aria-checked'),
  ).toBe('true');
  expect(
    screen
      .getByRole('radio', { name: 'Grid view' })
      .getAttribute('aria-checked'),
  ).toBe('false');
});

it('reports the shape that was picked', () => {
  const onChange = vi.fn();
  modes({ onChange });
  fireEvent.click(screen.getByRole('radio', { name: 'Compact list' }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith('list');
});

it('stays in the chosen shape when it is picked again', () => {
  // A `single` toggle group reports an empty string when its pressed segment is
  // pressed again (see `shared/ui/toggle-group`). For a shape the user is already
  // reading that report means "no shape", and a library is always drawn in one —
  // so it is dropped here rather than passed on as a state no page can render.
  const onChange = vi.fn();
  modes({ value: 'grid', onChange });
  fireEvent.click(screen.getByRole('radio', { name: 'Grid view' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole('radio', { name: 'Grid view' })
      .getAttribute('aria-checked'),
  ).toBe('true');
});

it('will not be reshaped while it is disabled', () => {
  const onChange = vi.fn();
  modes({ disabled: true, onChange });
  fireEvent.click(screen.getByRole('radio', { name: 'Table view' }));
  expect(onChange).not.toHaveBeenCalled();
});
