import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * A row of segments where one is the current choice — the settings rail's
 * "System / Light / Dark", or any small either-or.
 *
 * Radix owns the semantics: a `single` group is announced as a radiogroup with
 * one checked radio, the arrow keys walk it, and the pressed segment carries
 * `data-state="on"`. In single mode pressing the pressed segment again clears
 * the group (Radix reports an empty string) — a caller that must always have a
 * choice passes `value` and ignores that report.
 *
 * The drawing has no component for this and no class to copy, so the shape is
 * ours: a recessed track holding the raised segment, which is how `_5`'s theme
 * buttons and `_6`'s settings rail both read. The track sits on the page canvas
 * (`bg-background`, the drawings' `surface-canvas`) and the chosen segment
 * takes the elevated surface (`bg-accent`), with the text of the unchosen ones
 * stepped back to `muted-foreground`.
 */

export function ToggleGroup({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn(
        'inline-flex w-fit items-stretch gap-1 rounded-lg',
        'border border-border bg-background p-1',
        className,
      )}
      {...props}
    />
  );
}

export function ToggleGroupItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5',
        'text-sm font-medium text-muted-foreground',
        'transition-colors outline-none hover:text-foreground',
        'data-[state=on]:bg-accent data-[state=on]:text-accent-foreground',
        'data-[state=on]:shadow-sm',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
