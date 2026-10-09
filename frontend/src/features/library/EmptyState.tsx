import type { ReactNode } from 'react';
import { cn } from '../../shared/ui/cn';

export type EmptyStateProps = {
  /** The mark above the words. Hidden from a reader: the title says it. */
  icon: ReactNode;
  title: ReactNode;
  message: ReactNode;
  /** What to do about it, when there is something to do. */
  action?: ReactNode;
  /**
   * What the state knows that the words do not — on a first launch, which
   * formats are supported. One row each.
   */
  hints?: ReactNode[];
  /**
   * How loudly it says it. `plain` is a listing that happens to be empty;
   * `hero` is a library that has never held anything, which is the one screen
   * where the words are the whole page.
   */
  variant?: 'plain' | 'hero';
  className?: string;
};

/**
 * The face of a listing with nothing on it.
 *
 * Two shapes, because there are two reasons for the same blank page. A library
 * that has been narrowed down to nothing, or a page the user has emptied, is a
 * state of the listing: it is drawn at the listing's own scale, between the
 * toolbar above and the footer below, and the way out is one press. A library
 * that has never held anything — 首启 — is the page rather than a state of it:
 * it is drawn large, and it carries the facts a user needs before choosing a
 * folder, which is what the hints are for.
 *
 * The icon is decorative and marked so: the glyph restates what the title
 * already says, and a screen reader that read both would say it twice.
 */
export function EmptyState({
  icon,
  title,
  message,
  action,
  hints,
  variant = 'plain',
  className,
}: EmptyStateProps) {
  const hero = variant === 'hero';
  return (
    <div
      data-slot="empty-state"
      data-variant={variant}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        hero ? 'gap-4 py-24' : 'gap-3 py-24',
        className,
      )}
    >
      <div
        data-slot="empty-state-icon"
        aria-hidden="true"
        className={cn(
          'text-muted-foreground [&_svg]:size-8',
          hero && 'rounded-full bg-muted p-5 [&_svg]:size-10',
        )}
      >
        {icon}
      </div>
      <h2 className={cn('font-semibold', hero ? 'text-3xl' : 'text-2xl')}>
        {title}
      </h2>
      <p className="max-w-md text-muted-foreground">{message}</p>
      {hints && hints.length > 0 && (
        <div
          data-slot="empty-state-hints"
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {hints.map((hint, index) => (
            <span
              key={index}
              className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground"
            >
              {hint}
            </span>
          ))}
        </div>
      )}
      {action}
    </div>
  );
}
