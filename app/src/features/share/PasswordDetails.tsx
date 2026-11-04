import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/ui/button'

/**
 * The password: masked until asked for, copyable without being shown, and
 * replaceable.
 *
 * The mask is the only state this block holds. Whether the value is the one a
 * running service checks, and whether asking for another is allowed at all, are
 * handed in — they are the server's answers, not this block's guesses.
 */
export function PasswordDetails({
  password,
  busy,
  needsRestart,
  onCopy,
  onRegenerate,
}: {
  password: string
  busy: boolean
  needsRestart: boolean
  onCopy: (text: string) => void
  onRegenerate: () => void
}) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-24 text-sm text-muted-foreground">
          {t('password')}
        </span>
        <code className="select-all">{shown ? password : '••••'}</code>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
        >
          {shown ? t('hidePassword') : t('showPassword')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onCopy(password)}>
          {t('copyPassword')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={onRegenerate}
        >
          {t('regeneratePassword')}
        </Button>
        {needsRestart && (
          <span className="text-sm text-warning">
            {t('passwordRestartNeeded')}
          </span>
        )}
      </div>
    </>
  )
}
