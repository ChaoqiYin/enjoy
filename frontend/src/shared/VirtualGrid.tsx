import type { Key, ReactNode } from 'react';

export const virtualGridLayout = {
  gap: 20,
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
