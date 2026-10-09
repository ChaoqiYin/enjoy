import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchInput } from './SearchInput';

afterEach(cleanup);

it('hands over what was typed, a letter at a time', () => {
  const onChange = vi.fn();
  render(<SearchInput value="" onChange={onChange} aria-label="Search" />);
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'holiday' },
  });
  expect(onChange).toHaveBeenCalledWith('holiday');
});

it('shows what is in it, and the placeholder while it is empty', () => {
  const { rerender } = render(
    <SearchInput
      value=""
      onChange={() => {}}
      placeholder="Search videos…"
      aria-label="Search"
    />,
  );
  const box = screen.getByRole('searchbox') as HTMLInputElement;
  expect(box.placeholder).toBe('Search videos…');
  expect(box.value).toBe('');
  rerender(
    <SearchInput
      value="holiday"
      onChange={() => {}}
      placeholder="Search videos…"
      aria-label="Search"
    />,
  );
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe(
    'holiday',
  );
});

it('names the keys that reach it, when the drawing names them', () => {
  const { rerender } = render(
    <SearchInput value="" onChange={() => {}} aria-label="Search" />,
  );
  // 原型 _8 writes ⌘ K beside the box. It is a hint, not a key handler: what
  // makes the box reachable is the drawing's own shortcut, and this is the
  // interface saying which one it is.
  expect(screen.queryByText('K')).toBeNull();
  rerender(
    <SearchInput
      value=""
      onChange={() => {}}
      kbdHint="K"
      aria-label="Search"
    />,
  );
  expect(screen.getByText('K')).toBeTruthy();
});

it('is a search box, and says so', () => {
  render(<SearchInput value="" onChange={() => {}} aria-label="Search" />);
  // A field that filters a list is a searchbox and not a textbox: that is the
  // role the platform gives an Escape key and a clear button to.
  expect(screen.getByRole('searchbox')).toBeTruthy();
});

it('stops taking input while the list is busy', () => {
  const onChange = vi.fn();
  render(
    <SearchInput value="" onChange={onChange} disabled aria-label="Search" />,
  );
  const box = screen.getByRole('searchbox') as HTMLInputElement;
  expect(box.disabled).toBe(true);
});

it('keeps the height the caller asked for', () => {
  const { container } = render(
    <SearchInput value="" onChange={() => {}} size="sm" aria-label="Search" />,
  );
  // Sizes are mirrored where a test can pin them without reading class names
  // (界面迁移的已知坑 §3), so the field and the control beside it cannot drift
  // apart unnoticed.
  expect(
    container.querySelector('[data-slot="input"]')?.getAttribute('data-size'),
  ).toBe('sm');
});
