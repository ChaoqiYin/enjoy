import { useCallback, useEffect, useState } from 'react'
import {
  normalizeError,
  type ApiClient,
  type ApiError,
  type Directory,
  type Space,
} from '../../shared/api'
import type { ScanEventSource } from '../../shared/scanEvents'

/** Phases in which the scan slot is occupied, so space commands are refused. */
const ACTIVE_PHASES = new Set([
  'discovering',
  'indexing',
  'metadata',
  'thumbnails',
  'paused',
])

export interface SettingsData {
  spaces: Space[]
  directories: Directory[]
  currentSpaceId: number | null
  scanning: boolean
  busy: boolean
  error: ApiError | null
  info: string | null
  createSpace(name: string): Promise<boolean>
  renameSpace(id: number, name: string): Promise<boolean>
  removeSpace(id: number): Promise<boolean>
  switchSpace(id: number): Promise<boolean>
  addDirectories(paths: string[]): Promise<boolean>
  removeDirectory(id: number): Promise<boolean>
  startScan(): Promise<boolean>
  rebuildThumbnails(): Promise<boolean>
  clearNotice(): void
}

/**
 * The settings page's view of the library: the space list, the current
 * space's folders, whether the scan slot is taken, and the commands that
 * change any of it.
 *
 * Every command reports its failure in `error` rather than throwing, so the
 * sections stay free of try/catch. The scan slot is read once on mount and then
 * followed on the scan channel, because another surface may start a scan while
 * this page is open.
 */
export function useSettingsData(
  api: ApiClient,
  scanEvents: ScanEventSource,
): SettingsData {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [directories, setDirectories] = useState<Directory[]>([])
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const currentSpaceId = spaces.find((space) => space.current)?.id ?? spaces[0]?.id ?? null

  const reload = useCallback(async () => {
    const list = await api.listSpaces()
    setSpaces(list)
    const current = list.find((space) => space.current) ?? list[0]
    setDirectories(current === undefined ? [] : await api.listDirectories(current.id))
  }, [api])

  useEffect(() => {
    let cancelled = false
    void reload().catch((failure: unknown) => {
      if (!cancelled) setError(normalizeError(failure))
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  useEffect(() => {
    let cancelled = false
    void api
      .getScanStatus()
      .then((status) => {
        if (!cancelled) setScanning(status.active)
      })
      .catch(() => {
        // An unreadable status leaves the space commands usable; the server
        // still refuses them while a scan runs.
      })
    const stop = scanEvents.subscribe((event) => {
      setScanning(ACTIVE_PHASES.has(event.phase))
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [api, scanEvents])

  const perform = useCallback(
    async (task: () => Promise<void>, success?: string): Promise<boolean> => {
      setBusy(true)
      setError(null)
      setInfo(null)
      try {
        await task()
        if (success !== undefined) setInfo(success)
        return true
      } catch (failure) {
        setError(normalizeError(failure))
        return false
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const createSpace = useCallback(
    (name: string) =>
      perform(async () => {
        await api.createSpace(name)
        await reload()
      }),
    [api, perform, reload],
  )

  const renameSpace = useCallback(
    (id: number, name: string) =>
      perform(async () => {
        await api.renameSpace(id, name)
        await reload()
      }),
    [api, perform, reload],
  )

  const removeSpace = useCallback(
    (id: number) =>
      perform(async () => {
        await api.deleteSpace(id)
        await reload()
      }),
    [api, perform, reload],
  )

  const switchSpace = useCallback(
    (id: number) =>
      perform(async () => {
        await api.switchSpace(id)
        await reload()
      }),
    [api, perform, reload],
  )

  const addDirectories = useCallback(
    (paths: string[]) =>
      perform(async () => {
        if (currentSpaceId === null) {
          throw { code: 'space.not_found', message: 'No current space' }
        }
        for (const path of paths) {
          await api.addDirectory(currentSpaceId, path)
        }
        await reload()
      }),
    [api, currentSpaceId, perform, reload],
  )

  const removeDirectory = useCallback(
    (id: number) =>
      perform(async () => {
        await api.removeDirectory(id)
        await reload()
      }),
    [api, perform, reload],
  )

  const startScan = useCallback(
    () =>
      perform(async () => {
        if (currentSpaceId === null) {
          throw { code: 'space.not_found', message: 'No current space' }
        }
        await api.startScan(currentSpaceId)
        setScanning(true)
      }, 'scanStarted'),
    [api, currentSpaceId, perform],
  )

  const rebuildThumbnails = useCallback(
    () =>
      perform(async () => {
        if (currentSpaceId === null) {
          throw { code: 'space.not_found', message: 'No current space' }
        }
        await api.rebuildThumbnails(currentSpaceId)
        setScanning(true)
      }, 'thumbnailsStarted'),
    [api, currentSpaceId, perform],
  )

  const clearNotice = useCallback(() => {
    setError(null)
    setInfo(null)
  }, [])

  return {
    spaces,
    directories,
    currentSpaceId,
    scanning,
    busy,
    error,
    info,
    createSpace,
    renameSpace,
    removeSpace,
    switchSpace,
    addDirectories,
    removeDirectory,
    startScan,
    rebuildThumbnails,
    clearNotice,
  }
}
