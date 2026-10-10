import type { ReactNode } from 'react';
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
          {children}
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
