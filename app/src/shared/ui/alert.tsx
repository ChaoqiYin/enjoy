import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/**
 * An inline message that is part of the page rather than a floating notice.
 * `role="alert"` is on it from the start: an alert that is rendered is an alert
 * that has just arrived, and announcing it once as it appears is the whole
 * point. A message that should not interrupt is a `Toast`.
 */
const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-x-2 rounded-lg border px-3 py-2.5 text-sm has-[>svg]:grid-cols-[auto_1fr] [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        info: 'border-info/30 bg-info/10 text-foreground [&>svg]:text-info',
        success:
          'border-success/30 bg-success/10 text-foreground [&>svg]:text-success',
        warning:
          'border-warning/40 bg-warning/10 text-foreground [&>svg]:text-warning',
        destructive:
          'border-destructive/30 bg-destructive/10 text-foreground [&>svg]:text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type AlertProps = ComponentProps<'div'> &
  VariantProps<typeof alertVariants>;

export function Alert({
  className,
  variant = 'default',
  ...props
}: AlertProps) {
  return (
    <div
      role="alert"
      data-slot="alert"
      data-variant={variant}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 font-medium', className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 text-muted-foreground', className)}
      {...props}
    />
  );
}
