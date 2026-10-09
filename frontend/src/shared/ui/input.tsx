import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/** The sizes are the ones `Button` offers so a field and the button beside it
 *  line up without either side picking a number. The square ones are for a
 *  field that carries only a glyph, which is the search box in the toolbar. */
const inputVariants = cva(
  'flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        sm: 'h-8',
        default: 'h-9',
        lg: 'h-10',
        'icon-sm': 'size-8 px-0 text-center',
        icon: 'size-9 px-0 text-center',
        'icon-lg': 'size-10 px-0 text-center',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

/** The `size` of a `<input>` is the number of characters it shows, which is not
 *  the question this component asks; the prop is taken over by the height. */
export type InputProps = Omit<ComponentProps<'input'>, 'size'> &
  VariantProps<typeof inputVariants>;

export function Input({
  className,
  size = 'default',
  type = 'text',
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  );
}
