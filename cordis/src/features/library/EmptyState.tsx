import type { ReactNode } from 'react'
import { cn } from '../../shared/cn'

export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  message: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center',
        className,
      )}
    >
      {icon !== undefined && (
        <div className="mb-3 text-muted-foreground">{icon}</div>
      )}
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  )
}
