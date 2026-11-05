import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  normalizeError,
  type ApiError,
  type ShareStatus,
} from '../../shared/api'
import { useServices } from '../../shared/services'

/** How often a running service's status is read again. Devices come and go
 *  without the interface doing anything, and nothing pushes that news. */
const REFRESH_MS = 5000

export interface ShareState {
  /** The last answer from the server; null until the first read lands. */
  status: ShareStatus | null
  /** Whether a command the user asked for is in flight. */
  busy: boolean
  /** The last command failure, or null. Polling failures are never kept. */
  error: ApiError | null
  start: () => Promise<boolean>
  stop: () => Promise<boolean>
  /** Stop and start again; the way a changed list reaches the client. */
  restart: () => Promise<boolean>
  regeneratePassword: () => Promise<boolean>
  /** Repeat the command that failed, if there was one. */
  retry: () => void
  dismissError: () => void
}

const ShareContext = createContext<ShareState | null>(null)

export function useShare(): ShareState {
  const value = useContext(ShareContext)
  if (value === null) {
    throw new Error('useShare must be used inside ShareProvider')
  }
  return value
}

/**
 * The share service, held above the page that starts it.
 *
 * The service outlives a visit to `/share` — a user who starts sharing and goes
 * back to the library is still sharing — so the header's indicator and the page
 * read the same state from here. The first read also produces the password the
 * server drew, which is why it happens even while nothing is running.
 *
 * `revision` is the body's space counter: a switch stops the service on the
 * server, and the interface has to read the answer again rather than keep
 * showing the state of the space it left. Polling runs only while the service
 * is running and no command is in flight, so a command's answer is never
 * overwritten by a read that started before it. A failed poll keeps the last
 * known state: a network blink is not worth clearing the screen over.
 */
export function ShareProvider({
  children,
  revision = 0,
}: {
  children: ReactNode
  revision?: number
}): ReactNode {
  const { api } = useServices()
  const [status, setStatus] = useState<ShareStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const retryAction = useRef<(() => Promise<ShareStatus>) | null>(null)

  useEffect(() => {
    let alive = true
    void api
      .getShareStatus()
      .then((answer) => {
        if (alive) setStatus(answer)
      })
      .catch(() => {
        // The interface already reads as stopped; a read that fails before the
        // first answer leaves it there rather than inventing a failure.
      })
    return () => {
      alive = false
    }
  }, [api, revision])

  const run = useCallback(
    async (action: () => Promise<ShareStatus>): Promise<boolean> => {
      setBusy(true)
      setError(null)
      try {
        const answer = await action()
        setStatus(answer)
        retryAction.current = null
        return true
      } catch (reason) {
        setError(normalizeError(reason))
        retryAction.current = action
        return false
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const running = status?.running ?? false

  useEffect(() => {
    if (!running || busy) return
    let alive = true
    const timer = setInterval(() => {
      void api
        .getShareStatus()
        .then((answer) => {
          if (alive) setStatus(answer)
        })
        .catch(() => {
          // Keep the last known state; the next tick may answer again.
        })
    }, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [running, busy, api])

  const start = useCallback(() => run(() => api.openShare()), [api, run])
  const stop = useCallback(() => run(() => api.closeShare()), [api, run])
  const restart = useCallback(() => run(() => api.restartShare()), [api, run])
  const regeneratePassword = useCallback(
    () => run(() => api.resetSharePassword()),
    [api, run],
  )

  const retry = useCallback(() => {
    const action = retryAction.current
    if (action !== null) void run(action)
  }, [run])

  const dismissError = useCallback(() => {
    retryAction.current = null
    setError(null)
  }, [])

  return (
    <ShareContext.Provider
      value={{ status, busy, error, start, stop, restart, regeneratePassword, retry, dismissError }}
    >
      {children}
    </ShareContext.Provider>
  )
}
