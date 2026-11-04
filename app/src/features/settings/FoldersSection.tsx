import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { Directory, MediaToolDetection } from '../../shared/api'
import { Button } from '../../shared/ui/button'
import { Input } from '../../shared/ui/input'
import { Label } from '../../shared/ui/label'
import { useServices } from '../../shared/services'
import { DirectoryActions } from '../library/DirectoryActions'
import { DirectoryRow } from './DirectoryRow'

/**
 * POSIX absolute, Windows drive absolute, or a UNC share.
 *
 * This only rejects obviously malformed input before a round-trip; the server
 * is the authority and also normalizes the stored path.
 */
function isAbsolutePath(value: string): boolean {
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value)
}

/**
 * The current space's folders and the ways to add, scan and rebuild them.
 *
 * It draws no card of its own — the page puts it in one, under a heading that
 * names the space. What it holds is the old page's arrangement: one card per
 * folder, and the folder-wide commands under the list rather than in the card
 * header, because they act on the list as a whole.
 *
 * The native picker is the preferred path. `unsupported` is a normal answer in
 * browser mode, so it swaps in a text field for an absolute path instead of
 * reporting a failure. Any other native failure is shown in place.
 */
export function FoldersSection({
  directories,
  scanning,
  busy,
  onAdd,
  onRemove,
  onScan,
  onRebuild,
}: {
  directories: Directory[]
  scanning: boolean
  busy: boolean
  onAdd: (paths: string[]) => Promise<boolean>
  onRemove: (id: number) => Promise<boolean>
  onScan: () => Promise<boolean>
  onRebuild: () => Promise<boolean>
}): ReactElement {
  const { t } = useTranslation()
  const { api } = useServices()
  const [manual, setManual] = useState(false)
  const [manualPath, setManualPath] = useState('')
  const [manualInvalid, setManualInvalid] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const [tools, setTools] = useState<MediaToolDetection | null>(null)

  useEffect(() => {
    let alive = true
    void api
      .getMediaTools()
      .then((found) => {
        if (alive) setTools(found)
      })
      .catch(() => {
        // The folder controls do not depend on the answer; a failed probe
        // simply leaves the line out.
      })
    return () => {
      alive = false
    }
  }, [api])

  const choose = async (): Promise<void> => {
    setPickerError(null)
    setManualInvalid(false)
    const result = await api.native<{ paths: string[] }>('path.chooseDirectory', {
      multiple: true,
    })
    if (!result.ok) {
      if (result.code === 'unsupported') {
        setManual(true)
        return
      }
      if (result.code === 'cancelled') return
      setPickerError(t('folderPickerFailed'))
      return
    }
    if (result.value.paths.length === 0) return
    if (await onAdd(result.value.paths)) setManual(false)
  }

  const submitManual = async (): Promise<void> => {
    const path = manualPath.trim()
    if (!isAbsolutePath(path)) {
      setManualInvalid(true)
      return
    }
    setManualInvalid(false)
    if (await onAdd([path])) {
      setManual(false)
      setManualPath('')
    }
  }

  return (
    <div className="space-y-3">
      {tools !== null && (
        <div data-testid="media-tools" className="space-y-1 text-sm">
          {(['ffmpeg', 'ffprobe'] as const).map((name) => (
            <p key={name} data-testid={`media-tool-${name}`}>
              <span className="text-muted-foreground">{name}</span>{' '}
              {tools[name] === null
                ? t('mediaToolsMissing')
                : t('mediaToolsFound', { path: tools[name] })}
            </p>
          ))}
        </div>
      )}

      {directories.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noFolders')}</p>
      ) : (
        directories.map((directory) => (
          <DirectoryRow
            key={directory.id}
            directory={directory}
            disabled={busy || scanning}
            onRemove={() => void onRemove(directory.id)}
          />
        ))
      )}

      <DirectoryActions
        busy={busy || scanning}
        onAdd={() => void choose()}
        onRescan={() => void onScan()}
        onRegenerate={() => void onRebuild()}
      />

      {manual && (
        <div className="space-y-2">
          <Label htmlFor="manual-folder-path">{t('folderPath')}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="manual-folder-path"
              data-testid="manual-folder-path"
              aria-label={t('folderPath')}
              placeholder={t('folderPathPlaceholder')}
              value={manualPath}
              disabled={busy}
              onChange={(event) => {
                setManualPath(event.target.value)
                setManualInvalid(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitManual()
              }}
              className="min-w-0 flex-1"
            />
            <Button
              data-testid="add-manual-folder"
              size="sm"
              disabled={busy || manualPath.trim() === ''}
              onClick={() => void submitManual()}
            >
              {t('addFolder')}
            </Button>
          </div>
          {manualInvalid && (
            <p role="alert" className="text-sm text-destructive">
              {t('folderPathAbsolute')}
            </p>
          )}
        </div>
      )}

      {pickerError !== null && (
        <p role="alert" className="text-sm text-destructive">
          {pickerError}
        </p>
      )}
    </div>
  )
}
