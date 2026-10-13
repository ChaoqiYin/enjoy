import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

afterEach(cleanup);

/** A class that asks for a foreground colour under the pointer. The rule itself
 *  is held repo-wide by `scripts/check-tokens.mjs`; this pins the one control
 *  the ticket was written about (ADR 0038). */
const pointerForegrounds = (el: Element) =>
  Array.from(el.classList).filter((name) =>
    /(hover|focus)[^:]*:text-/.test(name),
  );

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

/** The pointer may repaint a background and nothing else, and it may not reach
 *  the chosen segment at all (ADR 0038). jsdom computes no styles, so what is
 *  pinned is the declaration: the wash is asked for under the unchosen state
 *  alone, which is what keeps it off the chosen segment whatever order the two
 *  rules are written in. That the wash then really lands is the browser's half
 *  of the bargain, the same split `app/interface.test.tsx` draws. */
it('washes the segment under the pointer, and never the chosen one', () => {
  render(<ThemeChoice />);
  const chosen = screen.getByRole('radio', { name: 'System' });
  const spare = screen.getByRole('radio', { name: 'Light' });

  expect(chosen.classList.contains('data-[state=on]:bg-selection')).toBe(true);
  expect(spare.classList.contains('data-[state=off]:hover:bg-hover')).toBe(
    true,
  );
  // Nor may it repaint the words: lifting them to `--foreground` is what turned
  // the toolbar's icons black in light mode, where the two colours differ.
  expect(pointerForegrounds(chosen)).toEqual([]);
  expect(pointerForegrounds(spare)).toEqual([]);
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
