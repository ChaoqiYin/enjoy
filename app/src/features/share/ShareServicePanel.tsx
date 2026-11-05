import { useTranslation } from 'react-i18next'
import type { ShareStatus } from '../../shared/api'
import { Button } from '../../shared/ui/button'
import { Card } from '../../shared/ui/card'
import { cn } from '../../shared/ui/cn'
import { Separator } from '../../shared/ui/separator'
import { ConnectionDetails } from './ConnectionDetails'
import { DeviceList } from './DeviceList'
import { PasswordDetails } from './PasswordDetails'

/**
 * The service itself, as a column beside the list: whether it runs, how a
 * television reaches it, the credentials, and who has just asked.
 *
 * It is one card because these are one subject — the page's other column is the
 * shared list, which the service merely copies. The card is drawn in every
 * state: the password is known before the service starts, so a user can set the
 * television up first; the addresses are the running service's, and they are
 * the part that waits.
 */
export function ShareServicePanel({
  status,
  busy,
  onStart,
  onStop,
  onRestart,
  onCopy,
  onRegeneratePassword,
  className,
}: {
  status: ShareStatus | null
  busy: boolean
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onCopy: (text: string) => void
  onRegeneratePassword: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const running = status?.running ?? false
  // Both are "the running service is behind": one about the list it copied, one
  // about the password it was started with. One restart settles both.
  const restartNeeded =
    status?.listChanged === true || status?.needsRestart === true

  return (
    <Card className={className}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'mt-1.5 size-2 shrink-0 rounded-full',
              running ? 'bg-success' : 'bg-muted-foreground',
            )}
          />
          <span className="text-sm">
            {running ? t('sharingOn', { port: status?.port }) : t('sharingOff')}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={running ? 'secondary' : 'primary'}
            size="sm"
            disabled={busy}
            onClick={() => void (running ? onStop() : onStart())}
          >
            {running ? t('stopSharing') : t('startSharing')}
          </Button>
          {running && restartNeeded && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onRestart}
            >
              {t('restartSharing')}
            </Button>
          )}
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">{t('connectionTitle')}</h2>
        <ConnectionDetails
          running={running}
          port={status?.port ?? null}
          addresses={status?.addresses ?? []}
          username={status?.username ?? ''}
          onCopy={onCopy}
        />
        <PasswordDetails
          password={status?.password ?? ''}
          busy={busy}
          needsRestart={status?.needsRestart ?? false}
          onCopy={onCopy}
          onRegenerate={onRegeneratePassword}
        />
      </div>

      {running && (
        <>
          <Separator />
          <div className="flex flex-col gap-2 p-4">
            <h2 className="text-sm font-semibold">{t('devicesTitle')}</h2>
            <DeviceList devices={status?.devices ?? []} />
          </div>
        </>
      )}
    </Card>
  )
}
