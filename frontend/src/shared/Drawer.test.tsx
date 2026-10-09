import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Drawer } from './Drawer';

const closeLabel = 'Close details';

afterEach(cleanup);

function drawer({
  open = true,
  onClose = vi.fn(),
}: {
  open?: boolean;
  onClose?: () => void;
} = {}) {
  return (
    <Drawer
      open={open}
      title="Details"
      closeLabel={closeLabel}
      onClose={onClose}
    >
      <p>body</p>
    </Drawer>
  );
}

it('takes focus into the drawer on open and hands it back as the close starts', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const result = render(drawer());
  // The keyboard followed the drawer rather than staying on the page behind it.
  expect(document.activeElement).not.toBe(trigger);
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(
    true,
  );
  result.rerender(drawer({ open: false }));
  // Read straight after the flip rather than awaited: the panel is still on its
  // way out at this moment in a browser, and focus must already be back. jsdom
  // cannot draw that half — that the handover lands mid-slide is what the
  // browser walkthrough is for.
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

/** The focus handover happens in an effect keyed on `open`, the same effect
 *  that records where focus came from. If it ever ran on a plain re-render it
 *  would both steal focus back to the panel and record the panel itself as the
 *  place to return to. */
it('leaves focus alone while the panel re-renders', () => {
  const result = render(drawer());
  const panel = document.activeElement as HTMLElement;
  const inside = document.createElement('button');
  panel.append(inside);
  inside.focus();
  result.rerender(drawer());
  expect(document.activeElement).toBe(inside);
});

/** The shell is the same element the whole time: open, closed, open again.
 *  Being absent from the document is not how a closed drawer is expressed —
 *  `inert` is what takes it away instead, and that is what keeps the frame the
 *  page was given rather than a new one per open. */
it('keeps its dialog element in the document and takes it out with `inert`', () => {
  const result = render(drawer({ open: false }));
  // While closed the frame is the only dialog-shaped element there is, which is
  // how it can be read off the document on its own.
  const frame = document.querySelector('[role="dialog"]')!;
  expect(frame.hasAttribute('inert')).toBe(true);
  result.rerender(drawer({ open: true }));
  expect(document.contains(frame)).toBe(true);
  expect(frame.hasAttribute('inert')).toBe(false);
  result.rerender(drawer({ open: false }));
  expect(document.contains(frame)).toBe(true);
  expect(frame.hasAttribute('inert')).toBe(true);
});

it('opens as a dialog named after its own heading', () => {
  render(drawer());
  const heading = screen.getByRole('heading', { name: 'Details' });
  const dialog = screen.getByRole('dialog');
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)).toBe(
    heading,
  );
});

it('closes from a button that keeps its accessible name', () => {
  const onClose = vi.fn();
  render(drawer({ onClose }));
  const dismiss = screen.getByRole('button', { name: closeLabel });
  expect(dismiss.textContent).toBe('');
  expect(dismiss.querySelector('svg')).toBeTruthy();
  fireEvent.click(dismiss);
  expect(onClose).toHaveBeenCalledOnce();
});

it('closes with Escape while it is open, and not once it is closed', () => {
  const onClose = vi.fn();
  const result = render(drawer({ onClose }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
  result.rerender(drawer({ open: false, onClose }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
});
