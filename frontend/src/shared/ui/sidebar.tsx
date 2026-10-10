import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/**
 * A column of choices down the side of a page, drawn as the raised panel the
 * drawings put there: the rows that switch what is on screen, the one that opens
 * to show what is under it, and the current one filled in.
 *
 * It is the shadcn sidebar cut down to the part a page can use. Upstream is an
 * application shell: it keeps its collapsed state in a cookie, opens a drawer on
 * a phone, and ships a provider, a trigger, a drag handle and an inset for the
 * main content. None of that belongs inside a page — the settings page does not
 * scroll, so the rail has nothing to collapse behind, and this is a desktop app
 * whose rail is always open. So there is no provider, no context and no
 * `collapsible` prop: what is here is the one shape upstream calls
 * `collapsible="none"`, cut down to the rows that shape actually draws. Upstream
 * also wraps its rows in a scrolling `SidebarContent` and a `SidebarGroup`; with
 * one group and nothing that scrolls, both were two boxes doing nothing, so the
 * panel holds its own inset instead.
 *
 * Three things are done differently from upstream, all deliberate:
 *
 * 1. Every row is a `<button>`. Upstream's rows are `<a>` with an `asChild`
 *    escape, because its rows navigate; these switch which panel is on screen,
 *    so `SidebarMenuButton` and `SidebarMenuSubButton` render a button and
 *    neither takes `asChild` — which is also why nothing here comes from
 *    `radix-ui`. (An `<a>` with no `href` would be worse than a difference: it
 *    is not tabbable, does not answer Enter, and still calls itself a link.)
 * 2. The panel is the card from `card.tsx` — `rounded-xl border bg-sidebar
 *    shadow-sm` — minus its `overflow-hidden`, which it has no use for: nothing
 *    in here overflows. A row's `focus-visible:ring-2` is drawn outside the
 *    row's box, so clipping would make the ring's clearance depend on the
 *    panel's inset — two numbers with no reason to know about each other.
 * 3. The row says `outline-none`, as the rest of this directory does, where
 *    upstream says `outline-hidden`. The two differ only under forced colours,
 *    where upstream's keeps an invisible outline for the system to repaint; the
 *    house idiom is kept here, and this line is the one to change if that ever
 *    matters more than the consistency.
 *
 * What marks the current row is `data-active` for the eye — the classes below
 * are written against it, as upstream writes them — and `aria-current` for
 * everything else. Upstream sets only the first; deriving the second from the
 * same prop here is this repository's addition, borrowed from `MainNav`, and it
 * means the two cannot drift. There is no keyboard beyond Tab: upstream has none
 * either, and every row is an ordinary button, so the rail is walked one stop at
 * a time rather than by arrow keys.
 */

/** The column. `bg-sidebar` is the tint, and the border is what separates the
 *  panel from the page: in the light theme those two surfaces are two levels
 *  apart, and without an edge the tint is not there at all. */
export function Sidebar({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar"
      className={cn(
        'flex w-full flex-col rounded-xl border border-sidebar-border bg-sidebar p-2 text-sidebar-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<'li'>) {
  return (
    // `relative` is load-bearing: a badge is positioned against this, not the row.
    <li
      data-slot="sidebar-menu-item"
      className={cn('relative', className)}
      {...props}
    />
  );
}

/**
 * `peer/menu-button` and `data-size` on the button are load-bearing too: they are
 * what lets a badge take the row's colour when it is hovered or current, and sit
 * at a height that follows the row's size.
 */
export const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm text-sidebar-foreground outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      size: {
        sm: 'h-7 text-xs',
        default: 'h-8 text-sm',
        lg: 'h-12 text-sm',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export function SidebarMenuButton({
  isActive = false,
  size = 'default',
  className,
  ...props
}: ComponentProps<'button'> & {
  isActive?: boolean;
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  return (
    <button
      type="button"
      data-slot="sidebar-menu-button"
      data-size={size}
      data-active={isActive}
      aria-current={isActive ? 'true' : undefined}
      className={cn(sidebarMenuButtonVariants({ size }), className)}
      {...props}
    />
  );
}

/**
 * What a row has to report about itself — a count, a status. It is a sibling of
 * the button rather than a child of it, which is upstream's structure and what
 * `peer/menu-button` above is for; the consequence is that it is not part of the
 * row's name, though a reader still meets it walking the item.
 */
export function SidebarMenuBadge({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      className={cn(
        'pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none',
        'peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
        'peer-data-[size=sm]/menu-button:top-1',
        'peer-data-[size=default]/menu-button:top-1.5',
        'peer-data-[size=lg]/menu-button:top-2.5',
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuSub({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      // The two one-pixel shifts cancel; they are how upstream hangs the rule
      // off the parent row's padding rather than beside it.
      className={cn(
        'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5',
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuSubItem({
  className,
  ...props
}: ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      className={cn('relative', className)}
      {...props}
    />
  );
}

export function SidebarMenuSubButton({
  size = 'md',
  isActive = false,
  className,
  ...props
}: ComponentProps<'button'> & {
  size?: 'sm' | 'md';
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      data-slot="sidebar-menu-sub-button"
      data-size={size}
      data-active={isActive}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
        size === 'sm' && 'text-xs',
        size === 'md' && 'text-sm',
        className,
      )}
      {...props}
    />
  );
}
