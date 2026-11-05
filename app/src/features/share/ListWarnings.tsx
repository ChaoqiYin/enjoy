import { useTranslation } from 'react-i18next'
import type { SharePendingChanges } from '../../shared/api'
import { Alert, AlertDescription } from '../../shared/ui/alert'

/** How many names a sentence may carry before it stops being a sentence. */
const NAMES_SHOWN = 3

/**
 * What a running service is serving against what the list says now: files no
 * longer on disk, and paths added or removed since the service copied it.
 *
 * None of it is said while nothing is running — a list that differs from one no
 * service is offering is not a fact about anything — which is why they live
 * together and share that one rule. The restart that settles a pending change
 * sits on the service card, next to the state it acts on; this block only says
 * what changed.
 */
export function ListWarnings({
  running,
  missingFiles,
  listChanged,
  pendingChanges,
}: {
  running: boolean
  missingFiles: number
  listChanged: boolean
  pendingChanges: SharePendingChanges
}) {
  const { t, i18n } = useTranslation()
  if (!running) return null
  const separator = i18n.language.startsWith('zh') ? '、' : ', '
  const names = fileNameList(pendingChanges.removed, separator)
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
          <AlertDescription className="flex flex-col items-start gap-1">
            {pendingChanges.added.length > 0 && (
              <span>
                {t('sharePendingAdded', {
                  countText: pendingChanges.added.length.toLocaleString(
                    i18n.language,
                  ),
                })}
              </span>
            )}
            {pendingChanges.removed.length > 0 && (
              <span>
                {t('sharePendingRemoved', {
                  countText: pendingChanges.removed.length.toLocaleString(
                    i18n.language,
                  ),
                  names,
                })}
              </span>
            )}
            {/* A status from before the difference was reported, or one whose
                lists were pruned: the fact still holds without names. */}
            {pendingChanges.added.length === 0 &&
              pendingChanges.removed.length === 0 && (
                <span>{t('shareListChanged')}</span>
              )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

/** The first few files of a path list, with a mark that there are more. */
function fileNameList(paths: readonly string[], separator: string): string {
  const names = paths
    .slice(0, NAMES_SHOWN)
    .map((path) => path.split(/[\\/]/).pop() || path)
  return names.join(separator) + (paths.length > names.length ? '…' : '')
}
