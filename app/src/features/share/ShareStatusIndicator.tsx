import { useTranslation } from 'react-i18next'
import { navigate } from 'cordis-app/ui'
import { Tooltip } from '../../shared/Tooltip'
import { Button } from '../../shared/ui/button'
import { useShare } from './ShareProvider'

/**
 * Whether the service is running, at the right end of the header.
 *
 * The words are the answer and the dot is the glance. The dot is hidden from a
 * reader — the status text is what matters — and `role="status"` makes a service
 * that starts or stops while the user is on another page get announced. The
 * whole pill is the way to `/share`; the prompt says so.
 */
export function ShareStatusIndicator() {
  const { t } = useTranslation()
  const { status } = useShare()
  const running = status?.running ?? false
  const label = t(running ? 'shareRunning' : 'shareStopped')

  return (
    <Tooltip
      text={t(running ? 'shareRunningHint' : 'shareStoppedHint')}
      asChild
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        role="status"
        aria-label={label}
        data-state={running ? 'running' : 'idle'}
        onClick={() => navigate('/share')}
      >
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full ${
            running ? 'bg-share' : 'bg-muted-foreground'
          }`}
        />
        {label}
      </Button>
    </Tooltip>
  )
}
