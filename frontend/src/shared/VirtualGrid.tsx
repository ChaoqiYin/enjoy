import type { Key, ReactNode } from 'react';

export const virtualGridLayout = {
  gap: 20,
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
