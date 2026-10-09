import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Checkbox } from './checkbox';

afterEach(cleanup);

it('starts unchecked and reports the press that checks it', () => {
  const onCheckedChange = vi.fn();
  render(<Checkbox aria-label="Favorite" onCheckedChange={onCheckedChange} />);
  const box = screen.getByRole('checkbox', { name: 'Favorite' });
  expect(box.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(box);
  expect(onCheckedChange).toHaveBeenCalledWith(true);
});

it('reads as checked while it is checked', () => {
  render(<Checkbox aria-label="Favorite" checked />);
  expect(
    screen
      .getByRole('checkbox', { name: 'Favorite' })
      .getAttribute('aria-checked'),
  ).toBe('true');
});

it('refuses the press while it is disabled', () => {
  const onCheckedChange = vi.fn();
  render(
    <Checkbox
      aria-label="Favorite"
      disabled
      onCheckedChange={onCheckedChange}
    />,
  );
  const box = screen.getByRole('checkbox', { name: 'Favorite' });
  expect((box as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(box);
  expect(onCheckedChange).not.toHaveBeenCalled();
});
