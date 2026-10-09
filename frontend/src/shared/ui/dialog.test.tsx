import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

afterEach(cleanup);

const closeLabel = 'Close';

/** A caller-shaped dialog: the primitive owns none of the open state, so the
 *  test drives it the way a page would. */
function ConfirmQuestion({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>Remove index</DialogTrigger>
      <DialogContent closeLabel={closeLabel}>
        <DialogHeader>
          <DialogTitle>Remove the index?</DialogTitle>
          <DialogDescription>The original file is kept</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
          <button type="button" onClick={onConfirm}>
            Remove
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

it('opens from its trigger and names the dialog after its title', () => {
  render(<ConfirmQuestion onConfirm={() => {}} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Remove index' }));
  const dialog = screen.getByRole('dialog', { name: 'Remove the index?' });
  // The description is wired to the dialog too, rather than left as loose text.
  expect(dialog.getAttribute('aria-describedby')).toBe(
    screen.getByText('The original file is kept').id,
  );
});

/** Modality, as Radix 1.2 spells it: rather than an `aria-modal` attribute on
 *  the panel, the rest of the page is hidden from assistive tech while the
 *  dialog is up, and unhidden again when it goes. The focus trap and the
 *  handover back to the trigger are the other two halves of the same claim. */
it('is modal: the page behind is hidden, Escape closes, focus returns', async () => {
  render(
    <>
      <p>page behind</p>
      <ConfirmQuestion onConfirm={() => {}} />
    </>,
  );
  const behind = screen.getByText('page behind');
  expect(behind.closest('[aria-hidden="true"]')).toBeNull();

  const trigger = screen.getByRole('button', { name: 'Remove index' });
  fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog');
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(behind.closest('[aria-hidden="true"]')).not.toBeNull();

  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(behind.closest('[aria-hidden="true"]')).toBeNull();
  // Radix hands focus back on a `setTimeout(…, 0)` — after the close has been
  // painted — rather than during the unmount.
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});

/** A close button the caller labels, so the language stays with the caller and
 *  the visible name is the one the keyboard reaches. */
it('closes from its own close button and from the caller’s close control', () => {
  const onConfirm = () => {};
  render(<ConfirmQuestion onConfirm={onConfirm} />);
  fireEvent.click(screen.getByRole('button', { name: 'Remove index' }));
  fireEvent.click(screen.getByRole('button', { name: closeLabel }));
  expect(screen.queryByRole('dialog')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Remove index' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
