import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * A question or a short form that takes the window until it is answered.
 *
 * The modal behaviour is Radix's, not ours: the portal, the overlay, the focus
 * trap, `aria-modal`, the scroll lock and the return of focus to whatever
 * opened it all come from `DialogPrimitive`. What is here is the shape — the
 * panel's frame, its header and footer, and a close button the caller names.
 *
 * The close button has no label of its own: every user-facing string in this
 * app goes through i18n at the call site, so a hardcoded "Close" here would be
 * one string the translator never sees. `closeLabel` is required for that
 * reason — the same bargain `Drawer` makes.
 */

export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

export function DialogTrigger(
  props: ComponentProps<typeof DialogPrimitive.Trigger>,
) {
  return <DialogPrimitive.Trigger {...props} />;
}

export function DialogPortal(
  props: ComponentProps<typeof DialogPrimitive.Portal>,
) {
  return <DialogPrimitive.Portal {...props} />;
}

export function DialogClose(
  props: ComponentProps<typeof DialogPrimitive.Close>,
) {
  return <DialogPrimitive.Close {...props} />;
}

export function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

/** The panel itself: the portal, the overlay and the frame, with nothing in it
 *  that was not asked for. `DialogContent` is this plus a dismiss control, and
 *  a caller whose answers are its own two buttons takes this one — a dismiss
 *  control labelled with either of them would be that answer twice, and one
 *  labelled with neither would be a third way to say the same thing. */
export function DialogPanel({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
          'rounded-xl border border-border bg-popover p-6 text-popover-foreground',
          'shadow-[0_24px_50px_rgba(0,0,0,0.85)] outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      />
    </DialogPortal>
  );
}

export function DialogContent({
  className,
  children,
  closeLabel,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { closeLabel: string }) {
  return (
    <DialogPanel className={className} {...props}>
      {children}
      <DialogPrimitive.Close
        aria-label={closeLabel}
        className={cn(
          'absolute top-4 right-4 flex size-8 items-center justify-center rounded-lg',
          'bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground',
          'transition-colors outline-none',
        )}
      >
        <X size={16} aria-hidden="true" />
      </DialogPrimitive.Close>
    </DialogPanel>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn(
        'text-xl leading-[26px] font-semibold text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('pt-1.5 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
