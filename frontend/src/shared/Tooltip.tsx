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
 */
export function Tooltip({
  text,
  children,
  className = '',
  disabled = false,
}: TooltipProps) {
  if (disabled) return <>{children}</>;
  return (
    <TooltipRoot>
      <span data-slot="tooltip-anchor" className={className}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
      </span>
      <TooltipContent>{text}</TooltipContent>
    </TooltipRoot>
  );
}
