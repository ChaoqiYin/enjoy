import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * A short list of actions that drops from the control that owns them.
 *
 * Radix owns the menu semantics — the roving tabindex, `role="menu"` and
 * `menuitem`, the Escape and outside-press dismissal, and the focus that goes
 * back to the trigger — so this file is only the surface: the popover frame,
 * the item's own states, the separator and the group label.
 *
 * An item is fed either `onSelect` (Radix's callback, which fires on click and
 * on Enter/Space alike) or `asChild`, so a caller can hang a router link or a
 * native button off it without losing the menu's keyboard behaviour.
 */

export function DropdownMenu(
  props: ComponentProps<typeof DropdownMenuPrimitive.Root>,
) {
  return <DropdownMenuPrimitive.Root {...props} />;
}

export function DropdownMenuTrigger(
  props: ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
) {
  return <DropdownMenuPrimitive.Trigger {...props} />;
}

export function DropdownMenuGroup(
  props: ComponentProps<typeof DropdownMenuPrimitive.Group>,
) {
  return <DropdownMenuPrimitive.Group {...props} />;
}

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-56 overflow-hidden rounded-xl border border-border bg-popover p-1.5',
          'text-popover-foreground shadow-2xl backdrop-blur-2xl outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5',
        'text-sm outline-none select-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        'focus:bg-secondary focus:text-foreground',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-lg py-1.5 pr-2.5 pl-8',
        'text-sm outline-none select-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        'focus:bg-secondary focus:text-foreground',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2.5 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check size={14} aria-hidden="true" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        'px-2.5 py-1.5 font-mono text-[11px] leading-[14px] font-semibold tracking-[0.06em]',
        'text-muted-foreground uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1.5 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}
