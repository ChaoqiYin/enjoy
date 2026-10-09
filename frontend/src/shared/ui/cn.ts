import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Compose a component's class names from its variants, the caller's
 * `className`, and any inline conditions.
 *
 * `clsx` flattens the conditional forms; `tailwind-merge` then keeps the last
 * value of each conflicting utility group, so the caller's `p-4` beats the
 * variant's `p-2` regardless of the order the two land in the class attribute.
 * Every primitive in `shared/ui/` funnels through here rather than string
 * concatenation, which is what makes a caller's override predictable.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
