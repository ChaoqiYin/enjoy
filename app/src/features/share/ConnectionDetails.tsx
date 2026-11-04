import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ShareAddress } from '../../shared/api'
import { Badge } from '../../shared/ui/badge'
import { Button } from '../../shared/ui/button'

/**
 * What a user types into a television: the address, the user name, and — handed
 * in as children because it belongs under this heading — the password.
 *
 * The credentials are drawn whether or not anything is running: the password is
 * known before a service starts, so a user can set the television up first. The
 * addresses are the running service's, so they are the part that waits.
 */
export function ConnectionDetails({
  running,
  port,
  addresses,
  username,
  onCopy,
  children,
}: {
  running: boolean
  port: number | null
  addresses: ShareAddress[]
  username: string
  onCopy: (text: string) => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const url = (address: string) => `http://${address}:${port}/`

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{t('connectionTitle')}</h2>
      {running ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t('connectionRunning')}
          </p>
          {addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('connectionNoAddress')}
            </p>
          ) : (
            <ul className="space-y-1">
              {addresses.map((address) => (
                <li key={address.address} className="flex flex-wrap items-center gap-3">
                  <code className="select-all">{url(address.address)}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${t('copyAddress')}: ${url(address.address)}`}
                    onClick={() => onCopy(url(address.address))}
                  >
                    {t('copyAddress')}
                  </Button>
                  {address.loopback && (
                    <Badge variant="warning">{t('addressLoopback')}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t('connectionIdle')}</p>
      )}
      <div className="flex items-center gap-3">
        <span className="w-24 text-sm text-muted-foreground">
          {t('username')}
        </span>
        <code className="select-all">{username}</code>
      </div>
      {children}
    </section>
  )
}
