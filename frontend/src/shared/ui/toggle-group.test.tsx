import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

afterEach(cleanup);

/** Radix reports a single group as a radiogroup: one choice at a time, and the
 *  keyboard can walk it with the arrow keys. */
function ThemeChoice({
  onValueChange = vi.fn(),
}: {
  onValueChange?: (value: string) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      defaultValue="system"
      aria-label="Theme"
      onValueChange={onValueChange}
    >
      <ToggleGroupItem value="system">System</ToggleGroupItem>
      <ToggleGroupItem value="light">Light</ToggleGroupItem>
      <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
    </ToggleGroup>
  );
}

it('presents its segments as one labelled group of choices', () => {
  render(<ThemeChoice />);
  expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeDefined();
  expect(screen.getAllByRole('radio').map((item) => item.textContent)).toEqual([
    'System',
    'Light',
    'Dark',
  ]);
  expect(
    screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked'),
  ).toBe('true');
  expect(
    screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked'),
  ).toBe('false');
});

it('hands the chosen segment back and moves the mark to it', () => {
  const onValueChange = vi.fn();
  render(<ThemeChoice onValueChange={onValueChange} />);

  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  expect(onValueChange).toHaveBeenCalledExactlyOnceWith('dark');
  expect(
    screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked'),
  ).toBe('true');
  expect(
    screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked'),
  ).toBe('false');
});

/** Radix's single group lets the pressed segment be pressed again, and that
 *  clears the group. A caller that must always have one chosen passes `value`
 *  and ignores the empty report, which is why this is worth pinning down. */
it('clears the group when the chosen segment is pressed again', () => {
  const onValueChange = vi.fn();
  render(<ThemeChoice onValueChange={onValueChange} />);

  fireEvent.click(screen.getByRole('radio', { name: 'System' }));
  expect(onValueChange).toHaveBeenCalledExactlyOnceWith('');
  expect(
    screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked'),
  ).toBe('false');
});
