import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Button } from './button';

afterEach(cleanup);

const variants = [
  'primary',
  'secondary',
  'outline',
  'ghost',
  'destructive',
  'link',
  'info',
  'success',
  'warning',
] as const;

const sizes = ['sm', 'default', 'lg', 'icon-sm', 'icon', 'icon-lg'] as const;

it('is pressed by the name it shows', () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Scan</Button>);
  fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
  expect(onClick).toHaveBeenCalledOnce();
});

it('is the primary variant at the default size when nothing says otherwise', () => {
  render(<Button>Scan</Button>);
  const button = screen.getByRole('button');
  expect(button.getAttribute('data-variant')).toBe('primary');
  expect(button.getAttribute('data-size')).toBe('default');
});

it.each(variants)('wears the %s variant it is given', (variant) => {
  render(<Button variant={variant}>Scan</Button>);
  expect(screen.getByRole('button').getAttribute('data-variant')).toBe(variant);
});

it.each(sizes)('wears the %s size it is given', (size) => {
  render(<Button size={size} aria-label="Scan" />);
  expect(screen.getByRole('button').getAttribute('data-size')).toBe(size);
});

it('refuses the press while it is disabled', () => {
  const onClick = vi.fn();
  render(
    <Button disabled onClick={onClick}>
      Scan
    </Button>,
  );
  const button = screen.getByRole('button') as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(onClick).not.toHaveBeenCalled();
});

it('is whatever element it is asked to render as', () => {
  render(
    <Button asChild variant="ghost">
      <a href="/library">Detail</a>
    </Button>,
  );
  const link = screen.getByRole('link', { name: 'Detail' });
  expect(link.getAttribute('data-slot')).toBe('button');
  expect(link.getAttribute('data-variant')).toBe('ghost');
});
