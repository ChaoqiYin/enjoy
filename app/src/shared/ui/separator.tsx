import type { ComponentProps } from 'react';
import { Separator as SeparatorPrimitive } from 'radix-ui';
import { cn } from './cn';

/**
 * A line between two things. It is a real separator to assistive technology by
 * default, because every place this interface draws one it does divide two
 * parts of a page; `decorative` takes it back out for a line that is only
 * spacing.
 */
export function Separator({
  className,
  orientation = 'horizontal',
  decorative = false,
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      orientation={orientation}
      decorative={decorative}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
        className,
      )}
      {...props}
    />
  );
}
