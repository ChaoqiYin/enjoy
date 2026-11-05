import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/ui/button'

/**
 * What a user types into a television: the address and the user name, drawn as
 * rows inside the service card.
 *
 * The addresses are the running service's, so they are the part that waits; the
 * user name is known either way. The password follows this block, handed in by
 * the card so that the two credentials read as one group.
 */
export function ConnectionDetails({
  running,
  port,
  addresses,
  username,
  onCopy,
}: {
  running: boolean
  port: number | null
  addresses: string[]
  username: string
  onCopy: (text: string) => void
}) {
  const { t } = useTranslation()
  const url = (address: string) => `http://${address}:${port}/`

  return (
    <div className="flex flex-col gap-2 text-sm">
      {running ? (
        <>
          <p className="text-xs text-muted-foreground">
            {t('connectionRunning')}
          </p>
          {addresses.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('connectionNoAddress')}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {addresses.map((address) => (
                <li key={address} className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 font-mono text-xs break-all select-all">
                    {url(address)}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${t('copyAddress')}: ${url(address)}`}
                    onClick={() => onCopy(url(address))}
                  >
                    {t('copyAddress')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t('connectionIdle')}</p>
      )}
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-muted-foreground">
          {t('username')}
        </span>
        <code className="select-all">{username}</code>
      </div>
    </div>
  )
}
