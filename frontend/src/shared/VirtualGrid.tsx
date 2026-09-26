import type { Key, ReactNode } from 'react';

export const virtualGridLayout = {
  gap: 20,
  // The card's own border, on each side. The picture is 16:9 of what the column
  // has left once these are off, not of the column itself.
  cardBorder: 1,
  // Everything in a row whose height does not depend on how wide the column is:
  // the card's body, its two borders and the gap the row keeps below it — 86.53
  // pixels for a card at the 14px root font size, measured in the browser as
  // 64.53 + 1 + 1 + 20. Only the picture scales with the column, so this is the
  // whole of the estimate's constant part.
  //
  // It has to be measured again when the card's own box changes, because
  // nothing else can catch it: a wrong value here is not an error, it is a
  // first paint laid out at the wrong row height that then moves every row
  // below the first when the real one is measured — 14.6 pixels a row, before
  // this was measured and set.
  rowFooter: 86.53,
  // Room the scroll viewport keeps on its start edge, so the hover feedback of
  // the first row and first column is not clipped flat at the padding box. It
  // has to cover `4px lift + 1% of the card's height` at the top edge and `1%
  // of the column width + 4px of shadow spill` at the left; the worst layout is
  // a single column, where the column stops at 399 wide and the left edge needs
  // 7.99px. Pixels rather than the rem scale: what has to be covered comes from
  // the card's size, and the stylesheet's `html { font-size: 14px }` makes
  // `0.5rem` 7px here — measured too small for that layout. Full table: ADR
  // 0008.
  hoverRoom: 10,
  getColumnCount: (width: number) =>
    width >= 800 ? 4 : width >= 600 ? 3 : width >= 400 ? 2 : 1,
};

type VirtualGridProps<T> = {
  columns: number;
  totalHeight: number;
  rows: readonly {
    key: Key;
    index: number;
    offset: number;
    items: readonly T[];
  }[];
  measureRow: (element: HTMLDivElement | null) => void;
  renderItem: (item: T) => ReactNode;
};

export function VirtualGrid<T>({
  columns,
  totalHeight,
  rows,
  measureRow,
  renderItem,
}: VirtualGridProps<T>) {
  return (
    <div className="relative" style={{ height: totalHeight }}>
      {rows.map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={measureRow}
          className="absolute top-0 left-0 w-full grid"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: virtualGridLayout.gap,
            paddingBottom: virtualGridLayout.gap,
            transform: `translateY(${row.offset}px)`,
          }}
        >
          {row.items.map(renderItem)}
        </div>
      ))}
    </div>
  );
}
