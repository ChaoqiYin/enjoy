/**
 * The per-record menu.
 *
 * The reveal entry only exists when a shell answered the capability probe; in a
 * browser the whole menu is omitted rather than opening onto an action that
 * cannot run. Play and favorite are on the record itself, so the menu carries
 * only the action that has nowhere else to live.
 */

import { useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/ui/button'

export function VideoActions({
  path,
  onReveal,
}: {
  path: string
  onReveal: (path: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <Button
        data-testid="video-actions"
        variant="ghost"
        size="icon-sm"
        aria-label={t('actions')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreVertical className="size-4" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-40 rounded-md border border-border bg-card p-1 text-card-foreground shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-hover"
            onClick={() => {
              setOpen(false)
              onReveal(path)
            }}
          >
            {t('showInFolder')}
          </button>
        </div>
      )}
    </div>
  )
}
