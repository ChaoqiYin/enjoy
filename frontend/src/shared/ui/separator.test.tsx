import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Separator } from './separator';

afterEach(cleanup);

it('lies across the page by default', () => {
  render(<Separator />);
  const separator = screen.getByRole('separator');
  expect(separator.getAttribute('data-orientation')).toBe('horizontal');
  expect(separator.getAttribute('aria-orientation')).toBeNull();
});

it('stands up when it is vertical', () => {
  render(<Separator orientation="vertical" />);
  const separator = screen.getByRole('separator');
  expect(separator.getAttribute('data-orientation')).toBe('vertical');
  expect(separator.getAttribute('aria-orientation')).toBe('vertical');
});

it('can step out of the accessibility tree when it only draws a line', () => {
  render(<Separator decorative />);
  expect(screen.queryByRole('separator')).toBeNull();
});
