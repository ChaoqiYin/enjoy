import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from './popover';

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms per call; floating-ui asks every ancestor of the panel
// whether it sits in the top layer, so opening one popover spends several
// seconds of that. Nothing in these tests is a top-layer element, so answering
// `false` outright is both correct here and instant.
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

afterEach(cleanup);

/** The shape the settings page grows inline: a control that unfolds its own
 *  confirmation instead of opening a window. */
function InlineConfirm({ onConfirm = vi.fn() }) {
  return (
    <Popover>
      <PopoverTrigger>Remove</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Remove this folder?</PopoverTitle>
        <PopoverDescription>
          The files on disk are left alone.
        </PopoverDescription>
        <button type="button" onClick={onConfirm}>
          Yes, remove
        </button>
      </PopoverContent>
    </Popover>
  );
}

it('unfolds from its trigger and names what it is for', () => {
  render(<InlineConfirm />);
  const trigger = screen.getByRole('button', { name: 'Remove' });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('dialog')).toBeNull();

  fireEvent.click(trigger);
  const panel = screen.getByRole('dialog');
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('Remove this folder?')).toBeDefined();
  expect(screen.getByText('The files on disk are left alone.')).toBeDefined();
  expect(screen.getByRole('button', { name: 'Yes, remove' })).toBeDefined();
  expect(panel.textContent).toContain('Yes, remove');
});

it('folds away on Escape and hands focus back to the trigger', async () => {
  const onConfirm = vi.fn();
  render(<InlineConfirm onConfirm={onConfirm} />);
  const trigger = screen.getByRole('button', { name: 'Remove' });

  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onConfirm).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});
