import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SortSelect } from './SortSelect';

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms per call; floating-ui asks every ancestor of the panel
// whether it sits in the top layer, so opening one list spends several seconds
// of that. Nothing here is a top-layer element, so answering `false` outright is
// both correct and instant (界面迁移的已知坑 §4).
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

// jsdom lays nothing out and implements no scrolling, which is what Radix
// reaches for when it brings the chosen option into view.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

const options = [
  { value: 'newest', label: 'Recently added' },
  { value: 'played', label: 'Recently played' },
  { value: 'name', label: 'File name' },
  { value: 'size', label: 'File size' },
];

function orders({
  value = 'newest',
  onValueChange = vi.fn(),
  disabled,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
} = {}) {
  return render(
    <SortSelect
      value={value}
      options={options}
      onChange={onValueChange}
      disabled={disabled}
      aria-label="Sort"
    />,
  );
}

it('shows the order the list is read in', () => {
  orders({ value: 'name' });
  expect(screen.getByRole('combobox', { name: 'Sort' }).textContent).toContain(
    'File name',
  );
});

it('reads the list in the order that was pressed', () => {
  const onValueChange = vi.fn();
  orders({ onValueChange });
  fireEvent.click(screen.getByRole('combobox', { name: 'Sort' }));
  fireEvent.click(screen.getByRole('option', { name: 'File size' }));
  expect(onValueChange).toHaveBeenCalledWith('size');
});

it('offers every order it was handed, in the order it was handed them', () => {
  orders();
  fireEvent.click(screen.getByRole('combobox', { name: 'Sort' }));
  expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual(
    ['Recently added', 'Recently played', 'File name', 'File size'],
  );
});

it('cannot be opened while it is disabled', () => {
  const onValueChange = vi.fn();
  orders({ disabled: true, onValueChange });
  const trigger = screen.getByRole('combobox', { name: 'Sort' });
  expect((trigger as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(trigger);
  expect(screen.queryByRole('option')).toBeNull();
});
