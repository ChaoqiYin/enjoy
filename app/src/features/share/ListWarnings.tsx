import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '../../shared/ui/alert'

/**
 * The two facts about a shared list a running service is offering: files that
 * are no longer on disk, and a list that has changed since the service read it.
 *
 * Neither is said while nothing is running — a list that differs from one no
 * service is offering is not a fact about anything — which is why the two live
 * together and share that one rule.
 */
export function ListWarnings({
  running,
  missingFiles,
  listChanged,
}: {
  running: boolean
  missingFiles: number
  listChanged: boolean
}) {
  const { t, i18n } = useTranslation()
  if (!running) return null
  return (
    <div className="flex flex-col gap-2">
      {missingFiles > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {t('shareMissingFiles', {
              countText: missingFiles.toLocaleString(i18n.language),
            })}
          </AlertDescription>
        </Alert>
      )}
      {listChanged && (
        <Alert variant="warning">
          <AlertDescription>{t('shareListChanged')}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
