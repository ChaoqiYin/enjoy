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

export type ToastVariant = 'default' | 'info' | 'success' | 'warning' | 'destructive'

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
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setRecords((current) => current.filter((record) => record.id !== id))
  }, [])

  const show = useCallback(
    (input: ToastInput) => {
      const id = (nextId.current += 1)
      setRecords((current) => [...current, { ...input, id }])
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        dismiss(id)
      }, AUTO_CLOSE_MS)
      timers.current.add(timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        data-notification-host="end"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {records.map((record) => (
          <Alert
            key={record.id}
            role="status"
            variant={record.variant ?? 'default'}
            className="pointer-events-auto flex w-full max-w-md items-start gap-2 shadow-lg"
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
