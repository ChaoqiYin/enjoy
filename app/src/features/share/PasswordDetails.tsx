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
 *
 * It is drawn in the width of the service card's value column, so the label
 * lines up with the user name above it and the actions wrap under it rather
 * than pushing the value out of view.
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
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="w-14 shrink-0 text-muted-foreground">
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
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={onRegenerate}
        >
          {t('regeneratePassword')}
        </Button>
        {needsRestart && (
          <span className="text-xs text-warning">
            {t('passwordRestartNeeded')}
          </span>
        )}
      </div>
    </div>
  )
}
