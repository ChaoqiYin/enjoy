import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RadioGroup, RadioGroupItem } from './radio-group';

afterEach(cleanup);

function theme(value?: string, onValueChange = vi.fn()) {
  return render(
    <RadioGroup aria-label="Theme" value={value} onValueChange={onValueChange}>
      <RadioGroupItem value="system" aria-label="Follow the system" />
      <RadioGroupItem value="light" aria-label="Light" />
      <RadioGroupItem value="dark" aria-label="Dark" />
    </RadioGroup>,
  );
}

it('is one named group of choices', () => {
  theme('light');
  expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(3);
});

it('shows which choice is taken', () => {
  theme('light');
  expect(
    screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked'),
  ).toBe('true');
  expect(
    screen
      .getByRole('radio', { name: 'Follow the system' })
      .getAttribute('aria-checked'),
  ).toBe('false');
});

it('hands back the choice that was pressed', () => {
  const onValueChange = vi.fn();
  theme('light', onValueChange);
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  expect(onValueChange).toHaveBeenCalledWith('dark');
});

it('moves the choice with the arrow keys', async () => {
  const onValueChange = vi.fn();
  theme('system', onValueChange);
  fireEvent.keyDown(screen.getByRole('radio', { name: 'Follow the system' }), {
    key: 'ArrowDown',
  });
  // Radix moves the focus to the next item on a timer and takes the choice with
  // it, so the answer is not there the moment the key goes down.
  await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('light'));
});
