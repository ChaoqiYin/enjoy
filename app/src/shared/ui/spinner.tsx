import { Loader2 } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn';

const spinnerVariants = cva('inline-flex shrink-0 items-center', {
  variants: {
    size: {
      sm: '[&_svg]:size-3.5',
      default: '[&_svg]:size-4',
    },
  },
  defaultVariants: { size: 'default' },
});

export type SpinnerProps = Omit<ComponentProps<'span'>, 'children'> &
  VariantProps<typeof spinnerVariants> & {
    /** What is being waited for. Without it the spinner is silent, which is
     *  what a button that already carries a name wants. */
    label?: string;
  };

export function Spinner({
  className,
  size = 'default',
  label,
  ...props
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      data-slot="spinner"
      data-size={size}
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    >
      <Loader2 aria-hidden="true" className="animate-spin text-current" />
    </span>
  );
}
