import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { useTranslation } from 'react-i18next'
import { normalizeError, type Space } from '../../shared/api'
import { errorTranslationKey } from '../../shared/errorText'
import { ACTIVE_SCAN_PHASES } from '../../shared/scanEvents'
import { useServices } from '../../shared/services'
import { useToast } from '../../shared/toast'
import { Button } from '../../shared/ui/button'

/** One width for the trigger and the list under it, as the old header had it,
 *  so the control does not resize as spaces are renamed. */
const WIDTH = 'w-40'

/**
 * The space the rest of the screen is about, and the list to move to another.
 *
 * It sits in the header because every page is a page *of* this space: the
 * listing pages read it, the settings page edits it, and the name is what says
 * which library all of that applies to. Switching is a command on the backend
 * (`POST /api/spaces/:id/switch`); once it answers, `onSwitched` asks the body
 * to mount the pages again so they read the new space rather than the old one.
 *
 * While a scan holds the backend's scan slot the server refuses the command, so
 * the trigger is disabled and says why through `aria-describedby`, matching the
 * settings page's warning.
 */
export function SpaceSwitcher({
  onSwitched,
}: {
  onSwitched: () => void
}): ReactElement {
  const { t } = useTranslation()
  const { api, scanEvents } = useServices()
  const toast = useToast()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)

  const reload = useCallback(async () => {
    setSpaces(await api.listSpaces())
  }, [api])

  useEffect(() => {
    let alive = true
    void api
      .listSpaces()
      .then((list) => {
        if (alive) setSpaces(list)
      })
      .catch(() => {
        // A failed read leaves the trigger naming nothing; the pages report
        // the same failure where it matters.
      })
    return () => {
      alive = false
    }
  }, [api])

  useEffect(() => {
    let alive = true
    void api
      .getScanStatus()
      .then((status) => {
        if (alive) setScanning(status.active)
      })
      .catch(() => {
        // An unreadable status leaves the switcher usable; the server still
        // refuses a switch while a scan runs.
      })
    const stop = scanEvents.subscribe((event) => {
      setScanning(ACTIVE_SCAN_PHASES.has(event.phase))
    })
    return () => {
      alive = false
      stop()
    }
  }, [api, scanEvents])

  const current = spaces.find((space) => space.current) ?? spaces[0]

  const choose = async (space: Space): Promise<void> => {
    setOpen(false)
    if (space.current || busy) return
    setBusy(true)
    try {
      await api.switchSpace(space.id)
      await reload()
      onSwitched()
    } catch (failure) {
      const error = normalizeError(failure)
      toast.show({
        title: t('spaces'),
        body: t(errorTranslationKey(error)),
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`${WIDTH} justify-between`}
            disabled={scanning || busy}
            aria-disabled={scanning || busy || undefined}
            aria-describedby={scanning ? 'space-switch-blocked' : undefined}
          >
            <span className="min-w-0 flex-1 truncate text-left">
              {current?.name ?? t('spaces')}
            </span>
            {scanning && (
              <span id="space-switch-blocked" className="sr-only">
                {t('space.blocked.scanning')}
              </span>
            )}
            <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
          </Button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={6}
            className={`${WIDTH} z-50 rounded-md border border-border bg-popover p-1.5 text-popover-foreground shadow-md outline-none`}
          >
            <ul className="flex flex-col">
              {spaces.map((space) => (
                <li key={space.id}>
                  <button
                    type="button"
                    aria-current={space.current || undefined}
                    onClick={() => void choose(space)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm outline-none hover:bg-hover focus-visible:bg-hover"
                  >
                    <Check
                      size={14}
                      aria-hidden="true"
                      className={space.current ? '' : 'invisible'}
                    />
                    <span className="break-all">{space.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  )
}
