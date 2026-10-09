import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Spinner } from './spinner';

afterEach(cleanup);

it('says what is being waited for', () => {
  render(<Spinner label="Loading videos" />);
  expect(screen.getByRole('status', { name: 'Loading videos' })).toBeTruthy();
});

it('stays at the default size when nothing says otherwise', () => {
  render(<Spinner label="Loading videos" />);
  expect(screen.getByRole('status').getAttribute('data-size')).toBe('default');
});

it('wears the size it is given', () => {
  render(<Spinner size="sm" label="Loading videos" />);
  expect(screen.getByRole('status').getAttribute('data-size')).toBe('sm');
});
