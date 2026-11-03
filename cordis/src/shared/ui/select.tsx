/**
 * A small listbox-backed select.
 *
 * The build has no Radix dependency, and the two controls that need a select
 * want the same keyboard contract: arrows move the active option, Enter or
 * Space chooses it, Escape closes without choosing, and a click outside
 * dismisses the list. Focus stays on the trigger and the active option is
 * announced through `aria-activedescendant`, which is the combobox pattern.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../cn'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  id,
  disabled = false,
  className,
}: {
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  id?: string
  disabled?: boolean
  className?: string
}): ReactElement {
  const baseId = useId()
  const listId = `${baseId}-listbox`
  const optionId = (index: number) => `${baseId}-option-${index}`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = options.findIndex((option) => option.value === value)
  const selectedLabel = selected >= 0 ? options[selected]!.label : ''

  const openList = (): void => {
    setActive(selected >= 0 ? selected : 0)
    setOpen(true)
  }

  const choose = (index: number): void => {
    const option = options[index]
    if (option === undefined) return
    onChange(option.value)
    setOpen(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openList()
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((index) =>
        Math.max(0, Math.min(options.length - 1, index + step)),
      )
      return
    }
    if (event.key === 'Home' && open) {
      event.preventDefault()
      setActive(0)
      return
    }
    if (event.key === 'End' && open) {
      event.preventDefault()
      setActive(options.length - 1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(active)
      else openList()
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key === 'Tab') setOpen(false)
  }

  return (
    <div ref={root} className={cn('relative inline-block', className)}>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute top-full left-0 z-30 mt-1 max-h-60 w-full min-w-full overflow-auto rounded-md border border-border bg-card p-1 text-card-foreground shadow-lg"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              className={cn(
                'cursor-pointer rounded-sm px-2 py-1.5 text-sm',
                index === active && 'bg-hover',
              )}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
