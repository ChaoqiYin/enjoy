import type { ReactNode } from 'react';
import { Badge } from '../../shared/ui/badge';

/** One line of the details panel: the term, the value, and — where the value
 *  has a class of its own — the short name of that class. */
export type VideoMetaRow = {
  icon: ReactNode;
  label: string;
  value: string;
  badge?: string;
  /** Who wrote the value, where it did not come from the record itself. */
  source?: string;
};

/**
 * The metadata of a video, as the drawing lays it out: one term and its value
 * per line, the term with its glyph on the left and the value hard right.
 *
 * It is a definition list rather than a table, because a table is a grid of
 * rows and columns and this is a list of pairs — the pairing is what has to
 * survive, and `dl` is the element that says so. A badge belongs to the value
 * beside it and is drawn there, so that which line it qualifies is read off the
 * line rather than guessed from the table's edge.
 *
 * Two badges can stand beside a value and they are not the same claim: the
 * class says what the value *is* and wears the quiet fill the rest of the
 * interface uses for that, while the source says who wrote it and is drawn as
 * an outline so that the two are told apart at a glance. Neither is a fact
 * about the row's position, so both are drawn inside the row they belong to.
 */
export function VideoMetaTable({ rows }: { rows: VideoMetaRow[] }) {
  return (
    <dl
      data-slot="video-meta-table"
      className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-sm"
    >
      {rows.map((row) => (
        <div
          key={row.label}
          data-slot="video-meta-row"
          className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-hover/40"
        >
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            {row.icon}
            {row.label}
          </dt>
          <dd className="flex items-center gap-1.5">
            <span className="text-right font-mono font-medium break-all">
              {row.value}
            </span>
            {row.badge && (
              <Badge variant="secondary" size="sm">
                {row.badge}
              </Badge>
            )}
            {row.source && (
              <Badge variant="outline" size="sm">
                {row.source}
              </Badge>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
