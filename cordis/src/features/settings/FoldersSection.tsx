import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderPlus, Play, RefreshCw, Trash2 } from 'lucide-react'
import type { Directory, MediaToolDetection } from '../../shared/api'
import { Button } from '../../shared/ui/button'
import { useServices } from '../../shared/services'
import { inputClass } from './field'

/** POSIX absolute, Windows drive absolute, or a UNC share. */
function isAbsolutePath(value: string): boolean {
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value)
}

/**
 * The current space's folders and the two ways to add one.
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
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{t('folders')}</h2>
      <p className="text-sm text-muted-foreground">{t('foldersHelp')}</p>

      {tools !== null && (
        <div data-testid="media-tools" className="mt-2 space-y-1 text-sm">
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
        <p className="mt-3 text-sm text-muted-foreground">{t('noFolders')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {directories.map((directory) => (
            <li
              key={directory.id}
              data-testid={`folder-${directory.id}`}
              className="flex items-center gap-2 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {directory.path}
              </span>
              <Button
                data-testid={`remove-folder-${directory.id}`}
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={busy}
                onClick={() => void onRemove(directory.id)}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {t('removeFolder')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          data-testid="add-folder"
          size="lg"
          disabled={busy}
          onClick={() => void choose()}
        >
          <FolderPlus className="size-[18px]" aria-hidden="true" />
          {t('addFolder')}
        </Button>
        <Button
          data-testid="start-scan"
          size="lg"
          disabled={busy || scanning}
          onClick={() => void onScan()}
        >
          <Play className="size-[18px]" aria-hidden="true" />
          {scanning ? t('scanning') : t('scan')}
        </Button>
        <Button
          data-testid="rebuild-thumbnails"
          size="lg"
          variant="secondary"
          disabled={busy || scanning}
          onClick={() => void onRebuild()}
        >
          <RefreshCw className="size-[18px]" aria-hidden="true" />
          {t('rebuildThumbnails')}
        </Button>
      </div>

      {manual && (
        <div className="mt-3 space-y-2">
          <label
            htmlFor="manual-folder-path"
            className="text-sm font-medium"
          >
            {t('folderPath')}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
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
              className={`${inputClass} min-w-0 flex-1`}
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
        <p role="alert" className="mt-3 text-sm text-destructive">
          {pickerError}
        </p>
      )}
    </section>
  )
}
