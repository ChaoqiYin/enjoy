import type { ComponentProps } from 'react';
import { Search } from 'lucide-react';
import { Input } from '../../shared/ui/input';
import { cn } from '../../shared/ui/cn';

export type SearchInputProps = Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'size' | 'type' | 'className'
> & {
  value: string;
  /** The text as typed, not the event: a caller that wanted the event would be
   *  reading the box rather than what is in it. */
  onChange: (value: string) => void;
  /** One of `Input`'s own heights, so the field lines up with the button or the
   *  select beside it without either side picking a number. */
  size?: 'sm' | 'default' | 'lg';
  /** The keys the drawing says reach this box, written beside it. A hint: the
   *  shortcut itself is the drawing's, and nothing here listens for it. */
  kbdHint?: string;
  className?: string;
};

/**
 * The box a listing is narrowed by.
 *
 * A `search` field rather than a `text` one, which is what gives it a
 * searchbox role and, with it, the platform's own Escape-to-clear. The glyph
 * and the keyboard hint are decoration: the name the field is announced under
 * is the caller's, and the hint is a caption rather than a control.
 */
export function SearchInput({
  value,
  onChange,
  size = 'default',
  kbdHint,
  className,
  ...props
}: SearchInputProps) {
  return (
    <div data-slot="search-input" className={cn('relative grow', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        size={size}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn('ps-9', kbdHint && 'pe-16')}
        {...props}
      />
      {kbdHint && (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground"
        >
          {kbdHint}
        </kbd>
      )}
    </div>
  );
}
