import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms per call; floating-ui asks every ancestor of the panel
// whether it sits in the top layer, so opening one menu spends several seconds
// of that. Nothing in these tests is a top-layer element, so answering `false`
// outright is both correct here and instant. (`:popover-open` is the other
// question floating-ui asks; jsdom answers that one in a millisecond.)
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

afterEach(cleanup);

function Actions({
  onPlay = vi.fn(),
  onRemove = vi.fn(),
}: {
  onPlay?: () => void;
  onRemove?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>This video</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onPlay}>Play</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRemove}>
          Remove from library
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

it('opens from its trigger and lists labelled menu items', () => {
  render(<Actions />);
  const trigger = screen.getByRole('button', { name: 'Actions' });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('menu')).toBeNull();

  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const menu = screen.getByRole('menu');
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('This video')).toBeDefined();
  expect(
    screen.getAllByRole('menuitem').map((item) => item.textContent),
  ).toEqual(['Play', 'Remove from library']);
  expect(screen.getByRole('separator')).toBeDefined();
  // Opening from the keyboard puts the first item under the keys.
  expect(document.activeElement?.textContent).toBe('Play');
  expect(menu.contains(document.activeElement)).toBe(true);
});

it('runs the chosen item, closes, and hands focus back to the trigger', async () => {
  const onPlay = vi.fn();
  const onRemove = vi.fn();
  render(<Actions onPlay={onPlay} onRemove={onRemove} />);
  const trigger = screen.getByRole('button', { name: 'Actions' });

  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Play' }));
  expect(onPlay).toHaveBeenCalledOnce();
  expect(onRemove).not.toHaveBeenCalled();
  expect(screen.queryByRole('menu')).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});

/** Dismissal by pressing outside is Radix's too, but jsdom cannot drive it: a
 *  menu layer marks a pointerdown elsewhere as an outside interaction it has
 *  already intercepted and suppresses the close, and with no hit testing there
 *  is no way to make it "unintercepted". Escape exercises the same dismissal
 *  path and does reproduce, so that is the one asserted here. */
it('closes without choosing anything on Escape', () => {
  const onPlay = vi.fn();
  render(<Actions onPlay={onPlay} />);
  const trigger = screen.getByRole('button', { name: 'Actions' });

  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(onPlay).not.toHaveBeenCalled();
});
