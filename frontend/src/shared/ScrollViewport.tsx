import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

/**
 * The box a page scrolls in: where the two halves of a scrollbar meet.
 *
 * The lane is `.scroll-viewport`'s — `scrollbar-gutter: stable` and the flat
 * 20px tail margin, both of which are layout and belong to the page. What the
 * bar itself looks like is `.app-scrollbar`'s, worn here so that the four pages
 * that share this component do not each have to say so. The two are separate
 * classes on purpose (`docs/guides/列表与滚动.md`, ADR 0040): a box can want
 * either without the other, and the drawer, the select's list and the table's
 * own overflow wear only the second.
 *
 * It was three things until the scrollbar stopped being the engine's: a
 * `ResizeObserver` used to measure the platform's gutter into
 * `--native-scrollbar-width`, which nothing has read since the virtual list was
 * removed (ADR 0017) — and which no longer names anything now that the lane is
 * this interface's own ten pixels. What is left is the handle: the callers that
 * pass a ref scroll themselves back to the top with it.
 */
export const ScrollViewport = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<'div'>
>(function ScrollViewport({ className = '', ...props }, forwardedRef) {
  const viewport = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => viewport.current!);
  return (
    <div
      {...props}
      ref={viewport}
      className={`scroll-viewport app-scrollbar ${className}`}
    />
  );
});
