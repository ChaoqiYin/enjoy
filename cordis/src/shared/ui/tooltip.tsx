/**
 * A tooltip for text the layout had to truncate.
 *
 * It is deliberately small: hover or focus opens it after the truncation
 * delay, moving away closes it, and no positioning library is involved. The
 * wrapper does not add a tab stop to read-only text; a focusable child (such
 * as the path button) opens it through focus.
 */

import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { cn } from '../cn'

export function Tooltip({
  label,
  children,
  delay = 700,
  className,
}: {
  label: string
  children: ReactNode
  delay?: number
  className?: string
}): ReactElement {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = (): void => {
    if (timer.current !== null) return
    timer.current = setTimeout(() => {
      timer.current = null
      setOpen(true)
    }, delay)
  }

  const hide = (): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setOpen(false)
  }

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  return (
    <span
      data-tooltip-host="true"
      className={cn('relative max-w-full', className ?? 'inline-block')}
      onMouseOver={show}
      onMouseOut={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute top-full left-0 z-40 mt-1 max-w-sm rounded-md border border-border bg-card px-2 py-1 text-xs break-all whitespace-normal text-card-foreground shadow-lg"
        >
          {label}
        </span>
      )}
    </span>
  )
}
