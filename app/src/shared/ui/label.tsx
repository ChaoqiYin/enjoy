import type { ComponentProps } from 'react';
import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from './cn';

/**
 * Radix's label rather than a bare `<label>`: pressing one that wraps its
 * control has to reach the control, and Radix also keeps a press from selecting
 * the text under the pointer — which, on a settings row, reads as a flicker.
 */
export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none',
        className,
      )}
      {...props}
    />
  );
}
