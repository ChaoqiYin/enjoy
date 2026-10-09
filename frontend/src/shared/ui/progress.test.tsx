import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Progress } from './progress';

afterEach(cleanup);

it('reports how far along it is to assistive technology', () => {
  render(<Progress value={42} />);
  const bar = screen.getByRole('progressbar');
  expect(bar.getAttribute('aria-valuenow')).toBe('42');
  expect(bar.getAttribute('aria-valuemax')).toBe('100');
});

it('reads as unknown when it has no value yet', () => {
  render(<Progress />);
  const bar = screen.getByRole('progressbar');
  expect(bar.getAttribute('aria-valuenow')).toBeNull();
  expect(bar.getAttribute('data-state')).toBe('indeterminate');
});

it('takes its own range when the work is not counted in percent', () => {
  render(<Progress value={3} max={12} />);
  const bar = screen.getByRole('progressbar');
  expect(bar.getAttribute('aria-valuenow')).toBe('3');
  expect(bar.getAttribute('aria-valuemax')).toBe('12');
});
