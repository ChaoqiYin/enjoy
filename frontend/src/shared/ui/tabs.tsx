import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * One panel at a time, chosen from a strip of labelled tabs.
 *
 * Radix owns the wiring — `role="tablist"`/`tab`/`tabpanel`, `aria-selected`,
 * the roving tabindex, the arrow keys and which axis they walk, and the
 * `aria-controls`/`aria-labelledby` pair that joins a tab to its panel. This
 * file is the strip's surface only.
 *
 * `orientation` is the same prop Radix takes and reaches no further: it decides
 * which arrow keys move, and Radix writes it onto the list as
 * `aria-orientation`, so the layout below keys off `data-orientation` rather
 * than restating the prop. A vertical strip is drawn as an underline on its
 * left edge and stacks, matching the prototype's settings rail, and that rule
 * is this file's.
 *
 * The horizontal strip's mark is the caller's, and it is not laziness: the mark
 * that belongs on a horizontal strip slides between entries, and the only thing
 * that can be told to slide is one that knows which entry is current. Radix
 * keeps that in the DOM, as `data-state` — a trigger cannot read it about
 * itself in React, and no prop here would reach it. `MainNav` knows the route
 * and draws the underline; see there.
 */

export function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root {...props} />;
}

export function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex w-full items-stretch gap-1 border-border',
        'data-[orientation=horizontal]:flex-row data-[orientation=horizontal]:border-b',
        'data-[orientation=vertical]:flex-col data-[orientation=vertical]:border-l',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 text-left',
        'text-sm font-semibold text-muted-foreground outline-none',
        'transition-colors hover:text-foreground',
        // The strip removes the browser's outline, and the underline it draws
        // on the current entry is about the route, not about the keyboard. So
        // the entry has to paint its own focus marker, the same ring the
        // buttons carry, or a keyboard user cannot see where they are.
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'data-[state=active]:text-foreground',
        'data-[state=active]:data-[orientation=vertical]:border-l-2',
        'data-[state=active]:data-[orientation=vertical]:border-primary',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('outline-none', className)}
      {...props}
    />
  );
}
