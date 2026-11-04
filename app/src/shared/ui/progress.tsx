import type { ComponentProps } from 'react';
import { Progress as ProgressPrimitive } from 'radix-ui';
import { cn } from './cn';

/**
 * A bar drawn from a value rather than animated by a timer, so what the screen
 * shows and what assistive technology is told come from the same number. With
 * no `value` it reports itself as indeterminate instead of guessing zero.
 */
export function Progress({
  className,
  value,
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root>) {
  const filled =
    typeof value === 'number' && props.max
      ? Math.min(100, Math.max(0, (value / props.max) * 100))
      : value;
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-secondary',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-transform"
        style={{ transform: `translateX(-${100 - (filled ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
