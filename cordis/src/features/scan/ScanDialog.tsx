/**
 * The progress window a pass owns the screen with.
 *
 * It has no close control on purpose: a scan holds the single scan slot, so
 * pausing or cancelling are the only ways out. The host decides when it exists;
 * this component only draws one snapshot of the status and forwards the three
 * verbs.
 */

import { useTranslation } from 'react-i18next'
import type { ScanStatus } from '../../shared/api'
import { displayPath } from '../../shared/format'
import { Button } from '../../shared/ui/button'
import { Tooltip } from '../../shared/ui/tooltip'
import { phaseLabelKey } from './phases'

export function ScanDialog({
  status,
  cancelling,
  onPause,
  onResume,
  onCancel,
}: {
  status: ScanStatus
  cancelling: boolean
  onPause: () => void
  onResume: () => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  const paused = status.phase === 'paused'
  const current = displayPath(status.currentPath ?? '')
  const number = (value: number | undefined) =>
    new Intl.NumberFormat(i18n.language).format(value ?? 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <dialog
        open
        aria-modal="true"
        aria-labelledby="scan-dialog-title"
        data-testid="scan-dialog"
        onCancel={(event) => event.preventDefault()}
        className="m-0 w-full max-w-lg rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
      >
        <h2 id="scan-dialog-title" className="text-lg font-semibold">
          {t('scanTitle')}
        </h2>
        <p
          data-testid="scan-phase"
          className="mt-1 text-sm text-muted-foreground"
        >
          {t(phaseLabelKey(status.phase))}
        </p>
        <Tooltip label={current} className="mt-2 block w-full">
          <p data-testid="scan-current-path" className="truncate text-sm">
            {current}
          </p>
        </Tooltip>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Stat
            testid="scan-discovered"
            label={t('scanDiscovered')}
            value={number(status.discovered)}
          />
          <Stat
            testid="scan-indexed"
            label={t('scanIndexed')}
            value={number(status.indexed)}
          />
          <Stat
            testid="scan-metadata"
            label={t('scanMetadataReady')}
            value={number(status.metadataReady)}
          />
          <Stat
            testid="scan-thumbnails"
            label={t('scanThumbnailsReady')}
            value={number(status.thumbnailsReady)}
          />
          <Stat
            testid="scan-failures"
            label={t('scanFailures')}
            value={number(status.failures)}
          />
          <Stat
            testid="scan-unreachable"
            label={t('scanUnreachable')}
            value={number(status.unreachableDirectories)}
          />
        </dl>

        <div className="mt-5 flex justify-end gap-3">
          {paused ? (
            <Button
              data-testid="scan-resume"
              variant="success"
              size="lg"
              onClick={onResume}
              disabled={cancelling}
            >
              {t('resume')}
            </Button>
          ) : (
            <Button
              data-testid="scan-pause"
              variant="warning"
              size="lg"
              onClick={onPause}
              disabled={cancelling}
            >
              {t('pause')}
            </Button>
          )}
          <Button
            data-testid="scan-cancel"
            variant="secondary"
            size="lg"
            onClick={onCancel}
            disabled={cancelling}
          >
            {cancelling ? t('cancelling') : t('cancelScan')}
          </Button>
        </div>
      </dialog>
    </div>
  )
}

function Stat({
  testid,
  label,
  value,
}: {
  testid: string
  label: string
  value: string
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd data-testid={testid} className="font-medium tabular-nums">
        {value}
      </dd>
    </div>
  )
}
