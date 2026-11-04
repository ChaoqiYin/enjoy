/**
 * Single-segment `Range` parsing for file downloads.
 *
 * The share only needs the three forms players send (`start-end`, `start-`,
 * `-suffix`). A multi-range request is answered with the full file, which the
 * protocol allows, while a single range that cannot be satisfied is a 416.
 */

export type ParsedRange =
  | { kind: 'whole' }
  | { kind: 'unsatisfiable' }
  | { kind: 'range'; start: number; end: number }

function integer(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

export function parseRange(header: string | undefined, size: number): ParsedRange {
  if (!header) return { kind: 'whole' }
  const match = /^\s*bytes\s*=\s*(.+)$/i.exec(header)
  if (!match) return { kind: 'whole' }

  const specification = match[1]!.trim()
  // More than one range: let the client request the whole file instead.
  if (specification.includes(',')) return { kind: 'whole' }

  const dash = specification.indexOf('-')
  if (dash < 0) return { kind: 'unsatisfiable' }
  const rawStart = specification.slice(0, dash).trim()
  const rawEnd = specification.slice(dash + 1).trim()

  let start: number
  let end: number
  if (rawStart === '') {
    const suffix = integer(rawEnd)
    if (suffix === undefined || suffix <= 0 || size === 0) return { kind: 'unsatisfiable' }
    start = Math.max(size - suffix, 0)
    end = size - 1
  } else {
    const parsedStart = integer(rawStart)
    if (parsedStart === undefined) return { kind: 'unsatisfiable' }
    if (rawEnd === '') {
      if (parsedStart >= size) return { kind: 'unsatisfiable' }
      start = parsedStart
      end = size - 1
    } else {
      const parsedEnd = integer(rawEnd)
      if (parsedEnd === undefined || parsedEnd < parsedStart) return { kind: 'unsatisfiable' }
      if (parsedStart >= size) return { kind: 'unsatisfiable' }
      start = parsedStart
      end = Math.min(parsedEnd, size - 1)
    }
  }

  return { kind: 'range', start, end }
}
