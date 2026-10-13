import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from './cn';

/**
 * The press control for the whole interface. `primary` is the variant a caller
 * gets by saying nothing, because the drawings' one emphatic button per screen
 * is the common case.
 *
 * Every variant paints a background of its own, the two unfilled-looking ones
 * included: `outline` and `ghost` carry `--background`, which is the colour of
 * the layer the window's dot matrix is drawn on. The fill is there to stop the
 * dots rather than to give these two presence — `--background` is the page's
 * own colour and within a few levels of `--card`, so a caller gets the button
 * it had before with nothing behind it (ADR 0022). `link` is the exception and
 * stays bare: it draws no shape, so the dots behind its text are the same ones
 * around it, and a fill would turn a link into a button.
 *
 * The variant and size names are the contract other tickets import, so they are
 * mirrored onto `data-variant` / `data-size`: a test can pin which one was
 * asked for without reading class names, which change whenever the visual
 * language does.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        // The one variant that swaps the page's two ends: the fill is the
        // colour text is normally drawn in, and what sits on it is the page's
        // own. One declaration therefore reads dark-on-light in one theme and
        // light-on-dark in the other, without either being written twice. It is
        // for a mark that carries an identity of its own rather than this
        // application's accent — `RepositoryLink` is the only caller.
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
        // The icon-only sizes. `icon-sm` is the interface's icon button and the
        // one the toolbar, the directory rows and three of the four places a
        // video is drawn ask for. `icon-xs` is one step tighter and belongs to
        // the video card alone: there the glyph stays 14 pixels while the
        // button around it drops from 28 to 20 — 3 pixels of padding a side
        // instead of 7 — because a card draws three of these in a row beside a
        // duration, and that row had more air than it needed. The side is a
        // pixel value rather than one of the rem steps for the same reason the
        // padding is: what was asked for is the 3 pixels beside a 14-pixel
        // glyph, and no step lands on 20. The corner comes down with it, from
        // `rounded-md`'s 5 to `rounded-sm`'s 3 — a radius that reads as a soft
        // corner on a 28-pixel button reads as a near-circle on a 20-pixel one.
        'icon-sm': 'size-8',
        'icon-xs': 'size-[20px] rounded-sm',
        icon: 'size-9',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element as the button instead of adding a `<button>`
     *  of our own — for a link that has to keep being a link. */
    asChild?: boolean;
  };

export function Button({
  className,
  variant = 'primary',
  size = 'default',
  asChild = false,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return (
    <Component
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
