import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { Space } from '../../shared/api'
import { Button } from '../../shared/ui/button'
import { inputClass } from './field'

/**
 * The space list and the four commands that change it.
 *
 * While the scan slot is occupied the server refuses all four, so every
 * control here is disabled and the reason is spelled out once above the list
 * rather than repeated on each row.
 */
export function SpacesSection({
  spaces,
  scanning,
  busy,
  onCreate,
  onRename,
  onDelete,
  onSwitch,
}: {
  spaces: Space[]
  scanning: boolean
  busy: boolean
  onCreate: (name: string) => Promise<boolean>
  onRename: (id: number, name: string) => Promise<boolean>
  onDelete: (id: number) => Promise<boolean>
  onSwitch: (id: number) => Promise<boolean>
}): ReactElement {
  const { t } = useTranslation()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [confirming, setConfirming] = useState<number | null>(null)
  const disabled = scanning || busy

  const submitNew = async (): Promise<void> => {
    if (newName.trim() === '') return
    if (await onCreate(newName.trim())) setNewName('')
  }

  const submitRename = async (id: number): Promise<void> => {
    if (editName.trim() === '') return
    if (await onRename(id, editName.trim())) setEditing(null)
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{t('spaces')}</h2>
      <p className="text-sm text-muted-foreground">{t('spacesHelp')}</p>

      {scanning && (
        <p
          data-testid="space-blocked-notice"
          className="mt-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          {t('space.blocked.scanning')}
        </p>
      )}

      <ul className="mt-3 divide-y divide-border">
        {spaces.map((space) => (
          <li
            key={space.id}
            data-testid={`space-${space.id}`}
            className="flex flex-wrap items-center gap-2 py-2"
          >
            {editing === space.id ? (
              <>
                <input
                  data-testid={`rename-input-${space.id}`}
                  aria-label={t('spaceName')}
                  value={editName}
                  disabled={disabled}
                  onChange={(event) => setEditName(event.target.value)}
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <Button
                  data-testid={`save-space-${space.id}`}
                  size="sm"
                  disabled={disabled || editName.trim() === ''}
                  onClick={() => void submitRename(space.id)}
                >
                  {t('save')}
                </Button>
                <Button
                  data-testid={`cancel-space-${space.id}`}
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing(null)}
                >
                  {t('cancel')}
                </Button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {space.name}
                </span>
                {space.current && (
                  <span className="rounded-full bg-selection px-2 py-0.5 text-xs text-selection-foreground">
                    {t('currentSpace')}
                  </span>
                )}
                <Button
                  data-testid={`rename-space-${space.id}`}
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => {
                    setEditing(space.id)
                    setEditName(space.name)
                  }}
                >
                  {t('rename')}
                </Button>
                <Button
                  data-testid={`switch-space-${space.id}`}
                  size="sm"
                  variant="outline"
                  disabled={disabled || space.current}
                  onClick={() => void onSwitch(space.id)}
                >
                  {t('switchTo')}
                </Button>
                {confirming === space.id ? (
                  <>
                    <Button
                      data-testid={`confirm-delete-space-${space.id}`}
                      size="sm"
                      variant="destructive"
                      disabled={disabled}
                      onClick={() => {
                        void onDelete(space.id).then((done) => {
                          if (done) setConfirming(null)
                        })
                      }}
                    >
                      {t('confirmDelete')}
                    </Button>
                    <Button
                      data-testid={`cancel-delete-space-${space.id}`}
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirming(null)}
                    >
                      {t('cancel')}
                    </Button>
                  </>
                ) : (
                  <Button
                    data-testid={`delete-space-${space.id}`}
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={disabled || spaces.length <= 1}
                    onClick={() => setConfirming(space.id)}
                  >
                    {t('delete')}
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          data-testid="new-space-name"
          aria-label={t('spaceName')}
          placeholder={t('newSpace')}
          value={newName}
          disabled={disabled}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submitNew()
          }}
          className={`${inputClass} min-w-0 flex-1 sm:max-w-64`}
        />
        <Button
          data-testid="create-space"
          size="sm"
          disabled={disabled || newName.trim() === ''}
          onClick={() => void submitNew()}
        >
          {t('create')}
        </Button>
      </div>
    </section>
  )
}
