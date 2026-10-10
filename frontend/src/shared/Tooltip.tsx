import type { ComponentProps, ReactNode } from 'react';
import { Slot as SlotPrimitive } from 'radix-ui';
import {
  Tooltip as TooltipRoot,
  TooltipContent,
  TooltipTrigger,
} from './ui/tooltip';

type TooltipProps = {
  text: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  asChild?: boolean;
  delayDuration?: number;
};

/**
 * The caller's own element, with the prompt's open/closed state left off it.
 *
 * Radix stamps `data-state="closed"` on its trigger — so that a trigger can be
 * drawn from the prompt's state — and spreads the props it is handed *after*
 * that stamp, which makes the stamp the last word on the element the caller
 * wrote. A segment of a view switch keeps which shape is in force in that same
 * attribute (`data-state="on"`, see `shared/ui/toggle-group`), so the stamp
 * drew the chosen segment as though no shape were chosen; a badge that keeps a
 * state of its own was overwritten the same way.
 *
 * Handing the attribute on as `undefined` is no way out: Radix's `Toggle`
 * computes its own value before it spreads what it is given, so an `undefined`
 * takes the pressed state away with it. The attribute has to not arrive at all.
 * Everything else — the pointer, focus and click handlers that open the prompt,
 * the ref that positions it — is merged onto the caller's element untouched.
 */
function TooltipAnchor({
  children,
  ...props
}: ComponentProps<typeof SlotPrimitive.Slot> & { 'data-state'?: string }) {
  const { 'data-state': _dropped, ...rest } = props;
  return <SlotPrimitive.Slot {...rest}>{children}</SlotPrimitive.Slot>;
}

/**
 * The tooltip every existing call site already uses: a control, and the words
 * that say what it does.
 *
 * `className` stays on an element around the control rather than on the control
 * itself. Callers write their own class on the child — `w-full` on a file name
 * that has to fill its row — and both landing on one element would leave two
 * widths fighting over which the stylesheet meant. `disabled` hands the control
 * back untouched, for a caller that has nothing to add.
 *
 * `asChild` drops that wrapper: the caller's own element becomes the anchor.
 * Some places cannot take an extra element between a parent and its children —
 * a segment of a view switch, a table cell, the truncated text on a progress
 * row — and wrapping them would move the layout class onto a new node. The
 * anchor still carries `data-slot="tooltip-anchor"`, so the selectors and the
 * assertions that look for it keep working.
 *
 * An element the caller wrote is also the one element this must not rewrite, so
 * under `asChild` the trigger runs through `TooltipAnchor` — the prompt's own
 * `data-state` is dropped rather than handed on. The wrapper-anchor form below
 * keeps Radix's stamp, but there it lands on this component's own `span`, and
 * the control inside it is never touched.
 *
 * `delayDuration` is Radix's. It is 0 for the labels of controls the pointer is
 * already on, and larger where the trigger is a wide surface the pointer sweeps
 * across — a column of paths — so the words do not flash row by row.
 */
export function Tooltip({
  text,
  children,
  className = '',
  disabled = false,
  asChild = false,
  delayDuration = 0,
}: TooltipProps) {
  if (disabled) return <>{children}</>;
  if (asChild) {
    return (
      <TooltipRoot delayDuration={delayDuration}>
        <TooltipTrigger asChild data-slot="tooltip-anchor">
          <TooltipAnchor>{children}</TooltipAnchor>
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </TooltipRoot>
    );
  }
  return (
    <TooltipRoot delayDuration={delayDuration}>
      <span data-slot="tooltip-anchor" className={className}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
      </span>
      <TooltipContent>{text}</TooltipContent>
    </TooltipRoot>
  );
}
