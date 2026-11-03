import { useState } from 'react'
import { Copy, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ApiError } from '../../shared/api'
import { Alert, AlertDescription, AlertTitle } from '../../shared/ui/alert'
import { Button } from '../../shared/ui/button'
import type { PlayFailure } from './useVideoListing'

/** Failures that belong to the page rather than to one record. */
export function ListingNotices({
  error,
  playFailure,
  onRetry,
  onDismissError,
  onDismissPlayFailure,
}: {
  error: ApiError | null
  playFailure: PlayFailure | null
  onRetry: () => void
  onDismissError: () => void
  onDismissPlayFailure: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      {error !== null && (
        <Alert variant="destructive">
          <AlertTitle>{t('errorUnexpected')}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{error.message}</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t('retry')}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('close')}
              onClick={onDismissError}
            >
              <X className="size-3.5" />
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {playFailure !== null && (
        <PlayFailureNotice
          failure={playFailure}
          onDismiss={onDismissPlayFailure}
        />
      )}
    </div>
  )
}

function PlayFailureNotice({
  failure,
  onDismiss,
}: {
  failure: PlayFailure
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const unsupported = failure.code === 'unsupported'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(failure.path)
    } catch {
      // The clipboard can be unavailable (insecure origin, denied permission);
      // the message still tells the reader where to find the file.
    }
    setCopied(true)
  }

  return (
    <Alert variant="warning" data-testid="play-failure">
      <AlertTitle>
        {unsupported ? t('playUnsupported') : t('playFailed')}
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        {failure.message !== '' && <span>{failure.message}</span>}
        <Button variant="outline" size="sm" onClick={copy}>
          <Copy className="size-3.5" />
          {copied ? t('copied') : t('copyPath')}
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
