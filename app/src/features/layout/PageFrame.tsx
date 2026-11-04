import type { ReactNode, ReactElement } from 'react'

/**
 * The page's frame: the height left under the header, with the page's own
 * padding and gap. It is the old frame's — `p-6`, `gap-6`, and a page that
 * neither grows nor scrolls as a whole; each page decides which of its parts
 * scrolls.
 */
export function PageFrame({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col gap-6 overflow-hidden p-6">
      {children}
    </main>
  )
}
