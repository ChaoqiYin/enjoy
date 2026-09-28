import { useTranslation } from 'react-i18next';

/**
 * The two things worth saying about a 共享清单 that a running service is
 * offering: files that are not on disk any more, so a client will not be offered
 * them, and a list that has changed since the service read it, so what a client
 * gets is not what the user has picked.
 *
 * Both are like each other in the one way that matters: each is a fact about a
 * list *some service is offering*, so neither is said while nothing is running —
 * a list that differs from one that does not exist is not a fact about anything.
 * That rule is why the two live together rather than each beside the thing it
 * counts: it is one rule, said once.
 */
export function ListWarnings({
  running,
  missingFiles,
  listChanged,
}: {
  running: boolean;
  missingFiles: number;
  listChanged: boolean;
}) {
  const { t, i18n } = useTranslation();
  if (!running) return null;
  return (
    <>
      {missingFiles > 0 && (
        // The count and not the names: what the user needs to know is that the
        // television will show fewer than they picked.
        <p className="text-sm text-warning">
          {t('shareMissingFiles', {
            count: missingFiles,
            countText: missingFiles.toLocaleString(i18n.language),
          })}
        </p>
      )}
      {listChanged && (
        // The service keeps offering what it started with, so a change is only
        // a change after a restart — and a user who just added a video would
        // otherwise conclude the change did not work.
        <p className="text-sm text-warning">{t('shareListChanged')}</p>
      )}
    </>
  );
}
