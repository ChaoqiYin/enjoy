/**
 * In-page notices, shown in a fixed corner and dismissed by hand or timer.
 *
 * The first version uses this as the fallback for a system notification when
 * there is no shell (see `useNotify`); it is deliberately small: a title, an
 * optional line of body text, and a close button.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastInput {
  title: string
  body?: string
  variant?: ToastVariant
}

interface ToastRecord extends ToastInput {
  id: number
}

interface ToastApi {
  show(input: ToastInput): void
  dismiss(id: number): void
}

const ToastContext = createContext<ToastApi | null>(null)

const AUTO_CLOSE_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [records, setRecords] = useState<ToastRecord[]>([])
  const nextId = useRef(0)
  /** One close timer per auto-closing record, so a displaced one can be cleared. */
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setRecords((current) => current.filter((record) => record.id !== id))
  }, [])

  const show = useCallback(
    (input: ToastInput) => {
      const id = (nextId.current += 1)
      const record: ToastRecord = {
        ...input,
        variant: input.variant ?? 'info',
        id,
      }
      if (record.variant === 'error') {
        // An error is the thing that needs reading; it stays until dismissed
        // and is not displaced by whatever notice follows it.
        setRecords((current) => [...current, record])
        return
      }
      setRecords((current) => {
        // Informational notices are mutually exclusive: the newest is the
        // only one worth showing. Errors are kept in place.
        const kept = current.filter((entry) => entry.variant === 'error')
        for (const entry of current) {
          if (entry.variant === 'error') continue
          const timer = timers.current.get(entry.id)
          if (timer !== undefined) {
            clearTimeout(timer)
            timers.current.delete(entry.id)
          }
        }
        return [...kept, record]
      })
      const timer = setTimeout(() => {
        timers.current.delete(id)
        dismiss(id)
      }, AUTO_CLOSE_MS)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        data-notification-host="end"
        className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {records.map((record) => (
          <Alert
            key={record.id}
            role={record.variant === 'error' ? 'alert' : 'status'}
            variant={record.variant === 'error' ? 'destructive' : record.variant}
            className="pointer-events-auto flex w-full items-start gap-2 shadow-lg"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <AlertTitle>{record.title}</AlertTitle>
              {record.body !== undefined && record.body !== '' && (
                <AlertDescription>{record.body}</AlertDescription>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('close')}
              onClick={() => dismiss(record.id)}
            >
              <X aria-hidden="true" className="size-3.5" />
            </Button>
          </Alert>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (api === null) {
    throw new Error('useToast must be used inside ToastProvider')
  }
  return api
}
