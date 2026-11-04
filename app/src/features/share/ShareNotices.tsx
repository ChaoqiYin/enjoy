import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ApiError } from '../../shared/api'
import { errorTranslationKey } from '../../shared/errorText'
import { Alert, AlertDescription, AlertTitle } from '../../shared/ui/alert'
import { Button } from '../../shared/ui/button'

/**
 * A share command that failed, in the page rather than as a floating notice:
 * the control that caused it is right here, so the answer and its retry belong
 * beside it. Polling failures never reach this block.
 */
export function ShareNotices({
  error,
  onRetry,
  onDismiss,
}: {
  error: ApiError | null
  onRetry: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  if (error === null) return null
  return (
    <Alert variant="destructive">
      <AlertTitle>{t('errorUnexpected')}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span>{t(errorTranslationKey(error))}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('retry')}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t('close')}
          onClick={onDismiss}
        >
          <X className="size-3.5" />
        </Button>
      </AlertDescription>
    </Alert>
  )
}
