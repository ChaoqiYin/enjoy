import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Input } from './input';

afterEach(cleanup);

const sizes = ['sm', 'default', 'lg', 'icon-sm', 'icon', 'icon-lg'] as const;

it('hands back what is typed into it', () => {
  const onChange = vi.fn();
  render(<Input placeholder="Search videos" onChange={onChange} />);
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'deep sea' },
  });
  expect(onChange).toHaveBeenCalledOnce();
});

it('stays at the default size when nothing says otherwise', () => {
  render(<Input placeholder="Search videos" />);
  expect(screen.getByRole('textbox').getAttribute('data-size')).toBe('default');
});

it.each(sizes)('wears the %s size it is given', (size) => {
  render(<Input size={size} placeholder="Search videos" />);
  expect(screen.getByRole('textbox').getAttribute('data-size')).toBe(size);
});

it('cannot be typed into while it is disabled', () => {
  render(<Input disabled placeholder="Search videos" />);
  expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
});
