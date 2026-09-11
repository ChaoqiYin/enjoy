import { ArrowDownUp, Folder, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { SortOrder } from './libraryView';

type LibraryHeaderProps = {
  title: string;
  actions?: ReactNode;
  folders: string[];
  search: string;
  folder: string;
  sort: SortOrder;
  onSearchChange: (value: string) => void;
  onFolderChange: (value: string) => void;
  onSortChange: (value: SortOrder) => void;
};

export function LibraryHeader({
  title,
  actions,
  folders,
  search,
  folder,
  sort,
  onSearchChange,
  onFolderChange,
  onSortChange,
}: LibraryHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="shrink-0 space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="min-h-10 flex items-center text-3xl font-bold">
          {title}
        </h1>
        <div className="min-h-10 flex items-center sm:justify-end">
          {actions}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 items-center rounded-box bg-base-200/60 p-4">
        <label
          className="input input-bordered flex items-center gap-2 w-64 max-w-full"
          aria-label={t('search')}
        >
          <Search size={16} aria-hidden="true" />
          <input
            className="grow min-w-0"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('searchPlaceholder')}
          />
        </label>
        <label className="relative inline-flex items-center w-56 max-w-full">
          <Folder
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute start-3 z-10"
          />
          <select
            className="select w-full pl-9"
            aria-label={t('folder')}
            value={folder}
            onChange={(event) => onFolderChange(event.target.value)}
          >
            <option value="">
              {t('all')} {t('folder')}
            </option>
            {folders.map((path) => (
              <option key={path}>{path}</option>
            ))}
          </select>
        </label>
        <label className="relative inline-flex items-center w-56 max-w-full">
          <ArrowDownUp
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute start-3 z-10"
          />
          <select
            className="select w-full pl-9"
            aria-label={t('sort')}
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortOrder)}
          >
            <option value="newest">{t('newest')}</option>
            <option value="played">{t('history')}</option>
            <option value="name">{t('filename')}</option>
          </select>
        </label>
      </div>
    </div>
  );
}
