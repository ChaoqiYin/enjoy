import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';
import {
  Dialog,
  DialogClose,
  DialogCloseButton,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './dialog';

/**
 * A panel that slides in along one edge of the window.
 *
 * A sheet is a dialog that happens to be anchored to an edge — same modality,
 * same focus trap, same Escape, same portal — so it is built on the dialog
 * primitives rather than beside them, and the parts it shares are the very same
 * components under a second name. Only the panel is its own: `side` decides
 * which edge, and the slide reads from it.
 *
 * It is deliberately just the panel. A drawer is a sheet plus a contract — a
 * shell that stays mounted, `inert` while closed, one source of movement, a
 * 440px cap — and none of that lives here; a caller that wants it imposes it
 * with `className` and its own state. Baking the cap in would leave the drawer
 * unable to choose it.
 */

export const Sheet = Dialog;
export const SheetTrigger = DialogTrigger;
export const SheetClose = DialogClose;
export const SheetHeader = DialogHeader;
export const SheetFooter = DialogFooter;
export const SheetTitle = DialogTitle;
export const SheetDescription = DialogDescription;

/** Where the panel sits and which way it slides away from. */
const sides = {
  right:
    'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
  left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
  top: 'inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
  bottom:
    'inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
} as const;

export function SheetContent({
  className,
  children,
  closeLabel,
  side = 'right',
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  closeLabel: string;
  side?: keyof typeof sides;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col gap-4 border-border bg-popover p-6',
          'text-popover-foreground shadow-[0_24px_50px_rgba(0,0,0,0.85)] outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:duration-300 data-[state=open]:duration-300',
          sides[side],
          className,
        )}
        {...props}
      >
        {children}
        <DialogCloseButton label={closeLabel} />
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
