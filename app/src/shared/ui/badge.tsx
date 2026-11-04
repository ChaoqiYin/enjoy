import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        success: 'bg-success text-success-foreground',
        warning: 'bg-warning text-warning-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
        // The 已共享 mark's business pair — `status-shared` and
        // `status-shared-border` in the drawings — rather than a primitive's
        // colour. The pair exists because the mark is drawn over a photograph:
        // its fill is opaque, so the picture never reaches under it and the
        // edge is the only thing that can separate the badge from what it
        // covers. Both halves of the pair are therefore worn, and the base's
        // `border-transparent` is what this variant's border overrides.
        share: 'border-share-border bg-share text-white',
      },
      size: {
        sm: 'h-4 px-1.5 text-[10px]',
        default: 'h-5.5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants>;

export function Badge({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      data-size={size}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}
