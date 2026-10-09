import { Pagination as PaginationPrimitive } from '../../shared/ui/pagination';
import { PAGE_SIZE } from './listing';

export type PaginationProps = {
  /** Which page of the list is being read, counting from zero — the index the
   *  backend is asked for and the one the store holds (see `libraryView`). */
  index: number;
  /** How many records the list holds, which only the backend can say. */
  total: number;
  onPageChange: (index: number) => void;
  className?: string;
};

/**
 * The footer of a listing: which slice of it is on screen, and how to reach the
 * rest.
 *
 * This is where the two ways of counting pages meet, and the only place either
 * of them is written down. The library asks the backend for an index from zero
 * and remembers that index per description (`libraryView`), so "the search
 * changed, go back to page one" is a change of description rather than a page.
 * The reader, meanwhile, counts pages from one, and so does the primitive
 * underneath (`shared/ui/pagination`, which also owns the numbering, the two
 * ends and the summary's wording) — that is the drawing `_8`.
 *
 * A page size is not a parameter: one page is 24 records everywhere (`PAGE_SIZE`,
 * ADR 0017), and a footer that could be told otherwise is a second place for that
 * number to live.
 *
 * An index past the end is not corrected here: it is clamped where the page is
 * decided, before the interface is handed one (`useLibrary`, `clampPage`), so
 * what reaches this is a page that exists. The guard stays as the last word for
 * the one index that remains past the end — the first page of a list holding
 * nothing — where a range would name records 1 to 0 of 0 and be saying something
 * false.
 */
export function Pagination({
  index,
  total,
  onPageChange,
  className,
}: PaginationProps) {
  if (index < 0 || index * PAGE_SIZE >= total) return null;
  return (
    <PaginationPrimitive
      page={index + 1}
      pageSize={PAGE_SIZE}
      total={total}
      onPageChange={(page) => onPageChange(page - 1)}
      className={className}
    />
  );
}
