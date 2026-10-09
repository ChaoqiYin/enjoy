import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

// jsdom lays nothing out and implements no scrolling, which is what Radix
// reaches for when it brings the chosen option into view.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

function theme({
  value,
  size,
  disabled,
  onValueChange = vi.fn(),
}: {
  value?: string;
  size?: 'default' | 'sm';
  disabled?: boolean;
  onValueChange?: (value: string) => void;
} = {}) {
  return render(
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger aria-label="Theme" size={size}>
        <SelectValue placeholder="Follow the system" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light">Light</SelectItem>
        <SelectItem value="dark">Dark</SelectItem>
      </SelectContent>
    </Select>,
  );
}

it('shows what is chosen, and the placeholder until something is', () => {
  theme();
  expect(screen.getByRole('combobox', { name: 'Theme' }).textContent).toContain(
    'Follow the system',
  );
});

it('shows the chosen option in place of the placeholder', () => {
  theme({ value: 'dark' });
  expect(screen.getByRole('combobox', { name: 'Theme' }).textContent).toContain(
    'Dark',
  );
});

it('picks the option that was pressed', () => {
  const onValueChange = vi.fn();
  theme({ onValueChange });
  fireEvent.click(screen.getByRole('combobox', { name: 'Theme' }));
  fireEvent.click(screen.getByRole('option', { name: 'Light' }));
  expect(onValueChange).toHaveBeenCalledWith('light');
});

it('stays at the default size when nothing says otherwise', () => {
  theme();
  expect(
    screen.getByRole('combobox', { name: 'Theme' }).getAttribute('data-size'),
  ).toBe('default');
});

it('wears the small size it is given', () => {
  theme({ size: 'sm' });
  expect(
    screen.getByRole('combobox', { name: 'Theme' }).getAttribute('data-size'),
  ).toBe('sm');
});

it('cannot be opened while it is disabled', () => {
  theme({ disabled: true });
  const trigger = screen.getByRole('combobox', { name: 'Theme' });
  expect((trigger as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(trigger);
  expect(screen.queryByRole('option')).toBeNull();
});
