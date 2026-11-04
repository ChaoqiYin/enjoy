import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * A small panel that unfolds next to the control that asked for it — the
 * settings page's inline confirmation is the shape this is for.
 *
 * Unlike `Dialog`, a popover is not modal: the page behind it stays live, so
 * Radix keeps no focus trap and no overlay, and `PopoverTrigger` carries
 * `aria-expanded`. What Radix does own is the anchoring and the collision
 * handling (floating-ui), the Escape and outside-press dismissal, and the
 * return of focus to the trigger when it closes — none of it is restated here.
 *
 * The title and description are optional parts, not requirements: a panel
 * holding a sentence and a button does not need a heading, but one that does
 * gets the panel named for screen readers because `PopoverTitle` is what Radix
 * points `aria-labelledby` at.
 */

export function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />;
}

export function PopoverTrigger(
  props: ComponentProps<typeof PopoverPrimitive.Trigger>,
) {
  return <PopoverPrimitive.Trigger {...props} />;
}

/** Anchors the panel to something other than the trigger — a hovered row, an
 *  icon inside a larger control. */
export function PopoverAnchor(
  props: ComponentProps<typeof PopoverPrimitive.Anchor>,
) {
  return <PopoverPrimitive.Anchor {...props} />;
}

export function PopoverClose(
  props: ComponentProps<typeof PopoverPrimitive.Close>,
) {
  return <PopoverPrimitive.Close {...props} />;
}

export function PopoverContent({
  className,
  align = 'center',
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 rounded-xl border border-border bg-popover p-4',
          'text-popover-foreground shadow-2xl backdrop-blur-2xl outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export function PopoverTitle({
  className,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Title>) {
  return (
    <PopoverPrimitive.Title
      className={cn('text-sm font-semibold text-foreground', className)}
      {...props}
    />
  );
}

export function PopoverDescription({
  className,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Description>) {
  return (
    <PopoverPrimitive.Description
      className={cn('pt-1 text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

export function PopoverArrow({
  className,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Arrow>) {
  return (
    <PopoverPrimitive.Arrow
      className={cn('fill-popover stroke-border', className)}
      {...props}
    />
  );
}
