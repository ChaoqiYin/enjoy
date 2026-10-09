import { useTranslation } from 'react-i18next';
import { PAGE_SIZE } from './listing';

/**
 * How much there is, and how to get to the rest of it.
 *
 * It reads one page of a list, so it is the only thing on the page that can say
 * how long the list is: the count is the backend's, about the whole list, and
 * not the number of cards in hand. That is what a count means in a paginated
 * library (ADR 0016) — a page cannot count what it has not been given — and it
 * is why the line that used to say "N videos" over a page of N records is now
 * saying something else.
 *
 * The range and the two controls are drawn only when there is a page to go to.
 * A list that fits on one page has no other page, and a control that offers
 * nothing is noise — as is a range, which would only repeat the count beside it.
 * Both ends are places rather than directions: the buttons are shut rather than
 * hidden, so the pair stays where the eye left it (the header above them keeps
 * its height when the list grows past a page).
 *
 * Deliberately plain, and deliberately not the design's form: it is the entry
 * point this ticket needs, and the shape the design draws for it arrives with
 * the ticket that draws it.
 */
export function Pager({
  index,
  total,
  onPageChange,
}: {
  /** Which page of the list is being read. */
  index: number;
  /** How many records the list holds, which only the backend can say. */
  total: number;
  /** Turn to the page at this index. */
  onPageChange: (index: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const count = (value: number) => value.toLocaleString(i18n.language);
  const first = index * PAGE_SIZE + 1;
  const last = Math.min(first + PAGE_SIZE - 1, total);
  return (
    <div className="shrink-0 flex items-center gap-3">
      <p className="opacity-60">
        {t('videoCount', { countText: count(total) })}
      </p>
      {total > PAGE_SIZE && (
        <>
          <p className="opacity-60">
            {t('videoRange', { fromText: count(first), toText: count(last) })}
          </p>
          <div className="ml-auto flex gap-2">
            <button
              className="btn btn-sm"
              disabled={index === 0}
              onClick={() => onPageChange(index - 1)}
            >
              {t('previousPage')}
            </button>
            <button
              className="btn btn-sm"
              disabled={last >= total}
              onClick={() => onPageChange(index + 1)}
            >
              {t('nextPage')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
