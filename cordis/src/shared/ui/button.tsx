import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

/**
 * The press control, lifted from the existing shadcn layer with the same
 * variant names. The `asChild` slot is dropped because these pages never render
 * a button as a link; keeping it would pull Radix into this build for nothing.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-hover',
        ghost: 'bg-background hover:bg-hover',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        warning: 'bg-warning text-warning-foreground hover:bg-warning/90',
        success: 'bg-success text-success-foreground hover:bg-success/90',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-xs',
        default: 'h-9 px-4',
        lg: 'h-10 px-6',
        'icon-sm': 'size-8',
        'icon-xs': 'size-5 rounded-sm',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants>

export function Button({
  className,
  variant = 'primary',
  size = 'default',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
