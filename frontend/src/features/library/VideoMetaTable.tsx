import type { ReactNode } from 'react';
import { Badge } from '../../shared/ui/badge';

/** One line of the details panel: the term, the value, and — where the value
 *  has a class of its own — the short name of that class. */
export type VideoMetaRow = {
  icon: ReactNode;
  label: string;
  value: string;
  badge?: string;
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
          className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-accent/40"
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
          </dd>
        </div>
      ))}
    </dl>
  );
}
