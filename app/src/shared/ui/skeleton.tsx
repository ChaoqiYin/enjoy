import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * A box standing in for content that has not arrived. It says nothing to
 * assistive technology on purpose: a screen reader reading four grey blocks
 * tells the user less than the loading line that is already on the page.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
