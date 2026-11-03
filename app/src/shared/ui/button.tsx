import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '../cn'

/**
 * The shadcn button, carrying Enjoy's variant names and tokens. `primary` is
 * the variant a caller gets by saying nothing.
 *
 * Every variant paints a background of its own, the two unfilled-looking ones
 * included: `outline` and `ghost` carry `--background`, which is the colour of
 * the layer the window's dot matrix is drawn on. The fill is there to stop the
 * dots rather than to give these two presence.
 *
 * Variant and size names are the contract other modules import, so they are
 * mirrored onto `data-variant` / `data-size`: a test can pin which one was
 * asked for without reading class names.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        // The one variant that swaps the page's two ends: the fill is the
        // colour text is normally drawn in, and what sits on it is the page's
        // own. It is for a mark that carries an identity of its own rather
        // than this application's accent.
        inverse: 'bg-foreground text-background hover:bg-foreground/90',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-hover',
        ghost: 'bg-background hover:bg-hover',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'text-primary underline-offset-4 hover:underline',
        info: 'bg-info text-info-foreground hover:bg-info/90',
        success: 'bg-success text-success-foreground hover:bg-success/90',
        warning: 'bg-warning text-warning-foreground hover:bg-warning/90',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-xs',
        default: 'h-9 px-4',
        lg: 'h-10 px-6',
        'icon-sm': 'size-8',
        'icon-xs': 'size-[20px] rounded-sm',
        icon: 'size-9',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element as the button instead of adding a `<button>`
     *  of our own — for a link that has to keep being a link. */
    asChild?: boolean
  }

export function Button({
  className,
  variant = 'primary',
  size = 'default',
  asChild = false,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button'
  return (
    <Component
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
