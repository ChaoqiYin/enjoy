import { useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useContentWidth } from './useContentWidth';

type VirtualCollectionOptions<T> = {
  items: readonly T[];
  getItemKey: (item: T) => string | number;
  getColumnCount: (width: number) => number;
  estimateRowHeight: (width: number, columns: number) => number;
  scrollMargin?: number;
  overscan?: number;
  measurementKey?: string;
};

export function useVirtualCollection<T>({
  items,
  getItemKey,
  getColumnCount,
  estimateRowHeight,
  scrollMargin = 0,
  overscan = 3,
  measurementKey,
}: VirtualCollectionOptions<T>) {
  const [viewport, width] = useContentWidth<HTMLDivElement>();
  const columns = Math.max(1, Math.floor(getColumnCount(width)));
  const virtualizer = useVirtualizer({
    count: Math.ceil(items.length / columns),
    getScrollElement: () => viewport.current,
    estimateSize: () => estimateRowHeight(width, columns),
    getItemKey: (index) => getItemKey(items[index * columns]),
    overscan,
    scrollMargin,
  });
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [virtualizer, width, columns, scrollMargin, measurementKey]);
  const rows = virtualizer.getVirtualItems().map((row) => ({
    ...row,
    offset: row.start - scrollMargin,
    items: items.slice(row.index * columns, (row.index + 1) * columns),
  }));
  const totalHeight = virtualizer.getTotalSize();
  return {
    viewport,
    columns,
    rows,
    totalHeight,
    measureRow: virtualizer.measureElement,
    paddingTop: Math.max(0, rows[0]?.offset ?? 0),
    paddingBottom: Math.max(
      0,
      totalHeight - ((rows.at(-1)?.end ?? scrollMargin) - scrollMargin),
    ),
  };
}
