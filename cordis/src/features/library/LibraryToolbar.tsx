import { LayoutGrid, List, Table2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/ui/button'
import { cn } from '../../shared/cn'
import type { VideoFilter, VideoSort } from '../../shared/api'
import {
  FILTERS,
  SORT_ORDERS,
  VIEW_MODES,
  type Listing,
  type ViewMode,
} from './listing'

const VIEW_ICONS = {
  grid: LayoutGrid,
  list: List,
  table: Table2,
} as const

const VIEW_LABELS = {
  grid: 'viewGrid',
  list: 'viewList',
  table: 'viewTable',
} as const

const FILTER_LABELS = {
  all: 'filterAll',
  favorites: 'filterFavorites',
  played: 'filterPlayed',
} as const

const SORT_LABELS: Record<VideoSort, string> = {
  newest: 'newest',
  played: 'played',
  name: 'name',
  size: 'size',
}

interface LibraryToolbarProps {
  listing: Listing
  sort: VideoSort
  filter: VideoFilter
  viewMode: ViewMode
  onSortChange: (value: VideoSort) => void
  onFilterChange: (value: VideoFilter) => void
  onViewModeChange: (value: ViewMode) => void
}

/** The three controls every listing shares: narrow, order and shape. */
export function LibraryToolbar({
  listing,
  sort,
  filter,
  viewMode,
  onSortChange,
  onFilterChange,
  onViewModeChange,
}: LibraryToolbarProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        role="group"
        aria-label={t('filter')}
        className="inline-flex items-stretch gap-1 rounded-lg border border-border bg-background p-1"
      >
        {listing === 'favorites' ? (
          <FilterChip
            value="favorites"
            label={t('filterFavorites')}
            active
            onSelect={onFilterChange}
          />
        ) : (
          FILTERS.map((value) => (
            <FilterChip
              key={value}
              value={value}
              label={t(FILTER_LABELS[value])}
              active={value === filter}
              onSelect={onFilterChange}
            />
          ))
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{t('sort')}</span>
        <select
          aria-label={t('sort')}
          value={sort}
          onChange={(event) => onSortChange(event.target.value as VideoSort)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {SORT_ORDERS.map((value) => (
            <option key={value} value={value}>
              {t(SORT_LABELS[value])}
            </option>
          ))}
        </select>
      </label>

      <div
        role="group"
        aria-label={t('viewMode')}
        className="ml-auto inline-flex items-stretch gap-1 rounded-lg border border-border bg-background p-1"
      >
        {VIEW_MODES.map((value) => {
          const Icon = VIEW_ICONS[value]
          return (
            <Button
              key={value}
              data-testid={`view-mode-${value}`}
              variant="ghost"
              size="icon-sm"
              aria-label={t(VIEW_LABELS[value])}
              title={t(VIEW_LABELS[value])}
              aria-pressed={value === viewMode}
              onClick={() => onViewModeChange(value)}
              className={cn(
                'rounded-md',
                value === viewMode && 'bg-selection text-selection-foreground',
              )}
            >
              <Icon className="size-4" />
            </Button>
          )
        })}
      </div>
    </div>
  )
}

function FilterChip({
  value,
  label,
  active,
  onSelect,
}: {
  value: VideoFilter
  label: string
  active: boolean
  onSelect: (value: VideoFilter) => void
}) {
  return (
    <button
      type="button"
      data-testid={`filter-${value}`}
      aria-pressed={active}
      onClick={() => onSelect(value)}
      className={cn(
        'rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-hover',
        active && 'bg-selection text-selection-foreground shadow-sm',
      )}
    >
      {label}
    </button>
  )
}
