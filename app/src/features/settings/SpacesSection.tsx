import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { ApiError, Space } from '../../shared/api'
import { Badge } from '../../shared/ui/badge'
import { Button } from '../../shared/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../shared/ui/popover'
import { Tooltip } from '../../shared/Tooltip'
import { SpaceDialog } from './SpaceDialog'

/**
 * The space list and the three commands that change it, drawn the way the old
 * window drew them: one bordered block of tight rows, a small badge on the
 * current one, and an icon button per command.
 *
 * The rows are deliberately unlike the directory rows further down the page:
 * those are containers of a path each, and these are one short name and two
 * buttons. A card per space would read as the same kind of thing and take three
 * times the height, so the list is one bordered block instead.
 *
 * The set-level command is the button under the block. It used to be an input
 * and a button on the same line here; the old page opens a dialog instead, and
 * the dialog is where a refused name is reported — beside the field it is
 * about, with the text still in it.
 */
export function SpacesSection({
  spaces,
  scanning,
  busy,
  error,
  onCreate,
  onRename,
  onDelete,
  onClearError,
}: {
  spaces: Space[]
  scanning: boolean
  busy: boolean
  error: ApiError | null
  onCreate: (name: string) => Promise<boolean>
  onRename: (id: number, name: string) => Promise<boolean>
  onDelete: (id: number) => Promise<boolean>
  onClearError: () => void
}): ReactElement {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<Space | null>(null)
  // A pass, a paused pass, or one file's information being refreshed all hold
  // the same slot, and the server refuses these operations for every one of
  // them; the notice above the list says so once rather than on each row.
  const disabled = scanning || busy

  return (
    <>
      <div className="space-y-3">
        {scanning && (
          <p
            data-testid="space-blocked-notice"
            className="text-sm text-muted-foreground"
          >
            {t('spaceBlockedScanning')}
          </p>
        )}
        <ul className="divide-y divide-border rounded-xl border border-border">
          {spaces.map((space) => (
            <li
              key={space.id}
              data-testid={`space-${space.id}`}
              className="flex items-center gap-2 px-3 py-1.5 text-sm"
            >
              <span className="flex-1 break-all">{space.name}</span>
              {space.current && (
                <Badge size="sm">{t('spaceCurrent')}</Badge>
              )}
              <div className="flex shrink-0 items-center gap-1">
                <Tooltip text={t('spaceRename')}>
                  <Button
                    data-testid={`rename-space-${space.id}`}
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('spaceRename')}
                    disabled={disabled}
                    onClick={() => {
                      onClearError()
                      setRenaming(space)
                    }}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </Button>
                </Tooltip>
                <SpaceRemove
                  id={space.id}
                  name={space.name}
                  disabled={disabled || spaces.length <= 1}
                  onOpen={onClearError}
                  onConfirm={() => onDelete(space.id)}
                />
              </div>
            </li>
          ))}
        </ul>
        <Button
          data-testid="create-space"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onClearError()
            setCreating(true)
          }}
        >
          <Plus size={14} aria-hidden="true" />
          {t('spaceCreate')}
        </Button>
      </div>
      {creating && (
        <SpaceDialog
          title={t('spaceCreate')}
          initialName=""
          error={error}
          onSubmit={onCreate}
          onClose={() => setCreating(false)}
        />
      )}
      {renaming && (
        <SpaceDialog
          title={t('spaceRename')}
          initialName={renaming.name}
          error={error}
          onSubmit={(name) => onRename(renaming.id, name)}
          onClose={() => setRenaming(null)}
        />
      )}
    </>
  )
}

/**
 * The one destructive control on a row, and the question it asks in place
 * rather than in a window: deleting a space is not a path to walk through, so
 * the answer belongs beside the row it is about.
 *
 * There is no tooltip on it. The name is on the control for assistive
 * technology, and opening the question is one click either way — the same
 * bargain the old page's rows made.
 */
function SpaceRemove({
  id,
  name,
  disabled,
  onOpen,
  onConfirm,
}: {
  id: number
  name: string
  disabled: boolean
  onOpen: () => void
  onConfirm: () => void | Promise<unknown>
}): ReactElement {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          data-testid={`delete-space-${id}`}
          variant="ghost"
          size="icon-sm"
          className="text-destructive"
          aria-label={t('spaceRemove')}
          disabled={disabled}
          onClick={onOpen}
        >
          <Trash2 size={14} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="text-sm break-all">
          {t('spaceRemoveQuestion', { name })}
        </p>
        <div className="flex items-center justify-end gap-3 pt-3">
          <Button
            data-testid={`cancel-delete-space-${id}`}
            variant="secondary"
            size="sm"
            onClick={() => setOpen(false)}
          >
            {t('cancel')}
          </Button>
          <Button
            data-testid={`confirm-delete-space-${id}`}
            variant="destructive"
            size="sm"
            onClick={() => {
              setOpen(false)
              void onConfirm()
            }}
          >
            {t('confirm')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
