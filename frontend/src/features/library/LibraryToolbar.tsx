import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { displayPath } from '../../shared/format';
import { FolderSelect } from './FolderSelect';
import { SearchInput } from './SearchInput';
import { SortSelect } from './SortSelect';
import { ViewModeSwitch } from './ViewModeSwitch';
import { SORT_ORDER_LABELS, SORT_ORDERS } from './listing';
import type { SortOrder, ViewMode } from './listing';

export type LibraryToolbarProps = {
  /** What the page does besides reading a list. It is drawn inside the bar,
   *  between the filters and the view mode, so that it reads as one group in a
   *  row of groups rather than as a second row above them. */
  actions?: ReactNode;
  /** The folders the list can be narrowed to, as the backend stores them. */
  folders: string[];
  search: string;
  /** The folder the list is narrowed to, or the empty string for all of them. */
  folder: string;
  sort: SortOrder;
  viewMode: ViewMode;
  onSearchChange: (value: string) => void;
  onFolderChange: (value: string) => void;
  onSortChange: (value: SortOrder) => void;
  onViewModeChange: (value: ViewMode) => void;
  /** Whether the list is busy. Nothing that would narrow a list can be moved
   *  while there is no list to narrow. */
  disabled?: boolean;
  className?: string;
};

/**
 * The bar a listing is read from: what else the page does, and the four ways to
 * narrow or reshape the records under it — a search, a folder, an order and a
 * shape.
 *
 * The bar is the top of the page. It used to hang below a title line that named
 * the page and held the page's actions beside it; the name was the navigation's
 * to say (the entry the header marks as current) and the actions were a group of
 * one more kind sitting in this row, so both moved rather than stayed.
 *
 * It holds no state and asks for nothing. Every control is handed its value and
 * reports a change upwards, and which listing that change belongs to is the
 * caller's to know (see `useVideoPageView`): the toolbar is drawn once per page
 * and has no way to tell one page from another, so a value it remembered itself
 * would be a value it guessed.
 *
 * The folders arrive as paths and are shown as paths without their verbatim
 * prefix (`displayPath`, which is a display concern and not a filter's). They
 * arrive as the caller found them — which is the whole question of where a facet
 * comes from, answered there rather than here.
 *
 * The orders, by contrast, are not the caller's: `SORT_ORDERS` is the closed set
 * the query can name, and it is drawn in the words `SORT_ORDER_LABELS` gives it.
 */
export function LibraryToolbar({
  actions,
  folders,
  search,
  folder,
  sort,
  viewMode,
  onSearchChange,
  onFolderChange,
  onSortChange,
  onViewModeChange,
  disabled,
  className,
}: LibraryToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className={className}>
      <div
        data-slot="library-toolbar"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
      >
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
          disabled={disabled}
          className="min-w-56 flex-1"
        />
        <FolderSelect
          value={folder}
          options={[
            { value: '', label: t('allFolders') },
            ...folders.map((path) => ({
              value: path,
              label: displayPath(path),
            })),
          ]}
          onChange={onFolderChange}
          disabled={disabled}
          aria-label={t('folder')}
        />
        <SortSelect
          value={sort}
          options={SORT_ORDERS.map((order) => ({
            value: order,
            label: t(SORT_ORDER_LABELS[order]),
          }))}
          onChange={(value) => onSortChange(value as SortOrder)}
          disabled={disabled}
          aria-label={t('sort')}
        />
        <div
          className="hidden h-6 w-px bg-border sm:block"
          aria-hidden="true"
        />
        {actions}
        <ViewModeSwitch
          value={viewMode}
          onChange={onViewModeChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
