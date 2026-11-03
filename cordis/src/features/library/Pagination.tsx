import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/ui/button'
import { pageCount } from './listing'

export function Pagination({
  page,
  total,
  onTurn,
}: {
  page: number
  total: number
  onTurn: (page: number) => void
}) {
  const { t } = useTranslation()
  const pages = pageCount(total)
  if (pages <= 1) return null

  return (
    <nav
      aria-label={t('pageIndicator', { page: page + 1, pages })}
      className="flex items-center justify-center gap-3"
    >
      <Button
        data-testid="prev-page"
        variant="outline"
        size="icon-sm"
        aria-label={t('previousPage')}
        disabled={page === 0}
        onClick={() => onTurn(page - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span
        data-testid="page-indicator"
        className="min-w-16 text-center text-sm text-muted-foreground"
      >
        {t('pageIndicator', { page: page + 1, pages })}
      </span>
      <Button
        data-testid="next-page"
        variant="outline"
        size="icon-sm"
        aria-label={t('nextPage')}
        disabled={page >= pages - 1}
        onClick={() => onTurn(page + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  )
}
