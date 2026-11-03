import type { ComponentProps } from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { cn } from '../cn'

/**
 * Radix's tooltip: it opens on focus as well as on hover, which is what makes
 * truncated names readable without a pointer, and it describes its trigger to
 * assistive technology through `aria-describedby`.
 *
 * Each tooltip carries its own provider so the caller decides the delay. The
 * default is zero because these are labels of controls the pointer is already
 * on; a page that shows a long name only after a deliberate pause passes a
 * larger `delayDuration`.
 */
export function Tooltip({
  delayDuration = 0,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Root> & { delayDuration?: number }) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipPrimitive.Provider>
  )
}

export function TooltipTrigger(
  props: ComponentProps<typeof TooltipPrimitive.Trigger>,
) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

export function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-fit max-w-72 rounded-md bg-popover px-2 py-1 text-xs text-balance break-words text-popover-foreground shadow-md',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}
