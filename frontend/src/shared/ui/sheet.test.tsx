import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from './sheet';

afterEach(cleanup);

const closeLabel = 'Close';

/** Only the panel primitive is under test here. The drawer's own contract —
 *  the shell that stays mounted, `inert`, the single source of movement, the
 *  440px cap — belongs to the drawer built on top of this, so nothing below
 *  asserts how the panel mounts or how wide it is. */
function Panel() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>Show details</SheetTrigger>
      <SheetContent closeLabel={closeLabel}>
        <SheetTitle>Details</SheetTitle>
        <SheetDescription>Encoding and size</SheetDescription>
        <SheetClose>Done</SheetClose>
      </SheetContent>
    </Sheet>
  );
}

it('opens as a modal panel named after its title', () => {
  render(
    <>
      <p>the list behind</p>
      <Panel />
    </>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
  expect(screen.getByRole('dialog', { name: 'Details' })).toBeDefined();
  expect(
    screen.getByText('the list behind').closest('[aria-hidden="true"]'),
  ).not.toBeNull();
});

it('closes from the panel’s own button, with Escape, and from the caller’s control', async () => {
  render(<Panel />);
  const trigger = screen.getByRole('button', { name: 'Show details' });

  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: closeLabel }));
  expect(screen.queryByRole('dialog')).toBeNull();

  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();

  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.queryByRole('dialog')).toBeNull();

  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});
