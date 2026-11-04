import { forwardRef, useRef, useImperativeHandle } from 'react'
import type { ComponentPropsWithoutRef } from 'react'

/**
 * The box a page scrolls in: the lane is `.scroll-viewport`'s and the bar is
 * `.app-scrollbar`'s, so every scrolling page draws the same scrollbar in the
 * same reserved lane (ADR 0040).
 */
export const ScrollViewport = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<'div'>
>(function ScrollViewport({ className = '', ...props }, forwardedRef) {
  const viewport = useRef<HTMLDivElement>(null)
  useImperativeHandle(forwardedRef, () => viewport.current!)
  return (
    <div
      {...props}
      ref={viewport}
      className={`scroll-viewport app-scrollbar ${className}`}
    />
  )
})
