import type { ComponentProps } from 'react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { Circle } from 'lucide-react';
import { cn } from './cn';

/**
 * Radix's radio group rather than `<input type="radio">`: it is the one that
 * makes the whole group a single tab stop and moves the choice with the arrow
 * keys, which is the behaviour the theme picker's three cards are read with.
 */
export function RadioGroup({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('grid gap-2', className)}
      {...props}
    />
  );
}

export function RadioGroupItem({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'aspect-square size-4 shrink-0 rounded-full border border-input bg-transparent outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:text-primary',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex items-center justify-center text-current"
      >
        <Circle aria-hidden="true" className="size-2 fill-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}
