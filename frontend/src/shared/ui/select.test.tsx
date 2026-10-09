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

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms a call; floating-ui asks every ancestor of the floating
// panel that one question when the menu opens, which is what made this file the
// slowest one in the suite. Nothing here is a top-layer element, so answering
// `false` outright is both correct and instant (界面迁移的已知坑 §4).
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

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
