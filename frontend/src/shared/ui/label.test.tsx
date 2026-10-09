import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Input } from './input';
import { Label } from './label';

afterEach(cleanup);

it('names the field it is given', () => {
  render(
    <>
      <Label htmlFor="search">Search videos</Label>
      <Input id="search" />
    </>,
  );
  expect(screen.getByLabelText('Search videos')).toBe(
    screen.getByRole('textbox'),
  );
});

it('names the field it wraps', () => {
  render(
    <Label>
      Search videos
      <Input />
    </Label>,
  );
  expect(screen.getByRole('textbox', { name: 'Search videos' })).toBeTruthy();
});
