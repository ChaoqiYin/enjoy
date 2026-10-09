import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins the class names it is given', () => {
    expect(cn('flex', 'items-center')).toBe('flex items-center');
  });

  it('lets a later utility win over an earlier one that sets the same thing', () => {
    // The whole reason `tailwind-merge` sits here: a caller's override must not
    // depend on which class the stylesheet happens to place last.
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-muted-foreground', 'text-foreground')).toBe(
      'text-foreground',
    );
  });

  it('drops the falsy entries so a variant can be switched off inline', () => {
    expect(cn('flex', false, undefined, null, '', 'gap-2')).toBe('flex gap-2');
  });

  it('takes the object and array forms clsx allows', () => {
    expect(cn({ flex: true, hidden: false }, ['p-2', 'gap-2'])).toBe(
      'flex p-2 gap-2',
    );
  });
});
