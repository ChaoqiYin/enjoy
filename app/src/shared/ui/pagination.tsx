import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { cn } from './cn';

export type PaginationProps = {
  /** The page on screen, counting from one. */
  page: number;
  pageSize: number;
  /** How many records there are in all, not how many are on this page. */
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
};

/**
 * Which page numbers to draw: the two ends, the one on screen and its
 * neighbours, with a break standing in for whatever was left out. A reader
 * needs to know how far the list goes and how to get one step further; the
 * numbers in between are what the break is for.
 */
function paginationItems(page: number, pageCount: number): (number | 'gap')[] {
  const wanted = new Set([1, pageCount, page, page - 1, page + 1]);
  const numbers = [...wanted]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  let previous = 0;
  for (const value of numbers) {
    if (value - previous > 1) items.push('gap');
    items.push(value);
    previous = value;
  }
  return items;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: PaginationProps) {
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // One page is not a choice, and the count of records is already on the
  // toolbar; a footer that only says "1" is furniture. The count is why there is
  // no range line either: "showing 1–24 of 48" beside a list whose heading
  // already says how much it holds, over a row of page numbers that already says
  // how far it goes, is the same fact written three times.
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label={t('pagination')}
      data-slot="pagination"
      className={cn(
        'flex items-center justify-end gap-4 border-t border-border pt-4',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden="true" />
          {t('paginationPrevious')}
        </Button>
        <div className="flex items-center gap-1">
          {paginationItems(page, pageCount).map((item, index) =>
            item === 'gap' ? (
              <span
                key={`gap-${index}`}
                aria-hidden="true"
                className="px-1 text-sm text-muted-foreground"
              >
                …
              </span>
            ) : (
              <Button
                key={item}
                variant={item === page ? 'primary' : 'ghost'}
                size="icon-sm"
                aria-label={t('paginationPage', { page: item })}
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onPageChange(item)}
              >
                {item}
              </Button>
            ),
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          {t('paginationNext')}
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
