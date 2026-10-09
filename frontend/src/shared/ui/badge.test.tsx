import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Badge } from './badge';

afterEach(cleanup);

const variants = [
  'default',
  'secondary',
  'outline',
  'success',
  'warning',
  'destructive',
] as const;

const sizes = ['sm', 'default'] as const;

it('shows the word it carries', () => {
  render(<Badge>Indexed</Badge>);
  expect(screen.getByText('Indexed')).toBeTruthy();
});

it('is the default variant at the default size when nothing says otherwise', () => {
  render(<Badge>Indexed</Badge>);
  const badge = screen.getByText('Indexed');
  expect(badge.getAttribute('data-variant')).toBe('default');
  expect(badge.getAttribute('data-size')).toBe('default');
});

it.each(variants)('wears the %s variant it is given', (variant) => {
  render(<Badge variant={variant}>Indexed</Badge>);
  expect(screen.getByText('Indexed').getAttribute('data-variant')).toBe(
    variant,
  );
});

it.each(sizes)('wears the %s size it is given', (size) => {
  render(<Badge size={size}>Indexed</Badge>);
  expect(screen.getByText('Indexed').getAttribute('data-size')).toBe(size);
});
