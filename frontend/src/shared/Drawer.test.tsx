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

/** The backdrop and the icon button. The slide that would hide the backdrop is
 *  daisyUI's stylesheet, which jsdom never applies, so both are reachable by
 *  role from the first render. */
function closeButtons() {
  return screen.getAllByRole('button', { name: closeLabel });
}

it('takes focus on open and hands it back as soon as the close starts', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const result = render(drawer());
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(
    true,
  );
  result.rerender(drawer({ open: false }));
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
  expect(panel.contains(document.activeElement)).toBe(true);
});

it('closes with Escape and with the backdrop', () => {
  const onClose = vi.fn();
  render(drawer({ onClose }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
  fireEvent.click(closeButtons()[0]);
  expect(onClose).toHaveBeenCalledTimes(2);
});

/** The backdrop is clickable, so daisyUI styles it with a pointer cursor, and
 *  the whole content area under a hand reads as one big button. jsdom loads no
 *  stylesheets and computes no styles, so all this can pin is the class that
 *  clears it; the arrow a browser paints is confirmed by a desktop walkthrough. */
it('keeps the backdrop on the default cursor', () => {
  render(drawer());
  const backdrop = closeButtons()[0];
  expect(backdrop.classList.contains('drawer-overlay')).toBe(true);
  expect(backdrop.classList.contains('cursor-default')).toBe(true);
});

it('stops listening for Escape once it is closed', () => {
  const onClose = vi.fn();
  const result = render(drawer({ onClose }));
  result.rerender(drawer({ open: false, onClose }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).not.toHaveBeenCalled();
});

it('dismisses from an icon-only button that keeps its accessible name', () => {
  const onClose = vi.fn();
  render(drawer({ onClose }));
  const dismiss = closeButtons()[1];
  expect(dismiss.textContent).toBe('');
  expect(dismiss.querySelector('svg')).toBeTruthy();
  fireEvent.click(dismiss);
  expect(onClose).toHaveBeenCalledOnce();
});

/** `checked` on the toggle is the only thing that drives the slide now — that
 *  is what daisyUI's stylesheet reads, and jsdom never runs it — so this is the
 *  one place the contract can be pinned. The shell is expected to stay mounted
 *  through the close; being absent from the DOM is what `inert` replaces. */
it('drives the toggle from `open` and keeps the shell mounted when closed', () => {
  const result = render(drawer());
  const dialog = screen.getByRole('dialog');
  const toggle = document.querySelector<HTMLInputElement>('.drawer-toggle')!;
  expect(toggle.checked).toBe(true);
  expect(dialog.hasAttribute('inert')).toBe(false);
  result.rerender(drawer({ open: false }));
  expect(toggle.checked).toBe(false);
  expect(dialog.hasAttribute('inert')).toBe(true);
  expect(document.querySelector('[role="dialog"]')).toBe(dialog);
});
