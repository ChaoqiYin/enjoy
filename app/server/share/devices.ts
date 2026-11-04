/**
 * Who has been talking to the share service lately.
 *
 * A WebDAV client opens a connection, takes what it wants and closes it, so
 * there is no "online" state to report. There is only a request that arrived a
 * moment ago: this keeps the address, what the client called itself and when it
 * was last heard from, for the last minute.
 *
 * Only requests that got past the password reach here. A device with the wrong
 * password is not a client, and a network scan would otherwise fill the list.
 */

/** How long a request keeps a client on the list. */
export const WINDOW_MS = 60_000

/** The most clients kept; the oldest is dropped when a new one exceeds this. */
export const MAX_DEVICES = 64

/** The most of a user agent kept as a name. */
const NAME_LIMIT = 64

export interface ShareDevice {
  name: string
  address: string
  /** Epoch milliseconds, like every other time in this interface. */
  lastSeenAt: number
}

interface Entry {
  name: string
  lastSeenAt: number
}

export class DeviceActivity {
  private readonly entries = new Map<string, Entry>()
  private readonly now: () => number

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now
  }

  /** Record one authenticated request. */
  record(address: string, userAgent: string | undefined): void {
    if (address === '') return
    const now = this.now()
    this.prune(now)
    const name = deviceName(userAgent)
    const existing = this.entries.get(address)
    if (existing) {
      existing.lastSeenAt = now
      // A client that names itself once and then sends nothing is the same
      // device, not one that changed its name.
      if (name !== '') existing.name = name
    } else {
      this.entries.set(address, { name, lastSeenAt: now })
    }
    this.evict()
  }

  /** Forget everyone; a service that stopped keeps no list. */
  clear(): void {
    this.entries.clear()
  }

  /** The clients heard from within the window, most recent first. */
  recent(): ShareDevice[] {
    const now = this.now()
    this.prune(now)
    return [...this.entries]
      .map(([address, entry]) => ({
        name: entry.name,
        address,
        lastSeenAt: entry.lastSeenAt,
      }))
      .sort(
        (left, right) =>
          right.lastSeenAt - left.lastSeenAt ||
          (left.address < right.address ? -1 : left.address > right.address ? 1 : 0),
      )
  }

  /** Drop entries older than the window; reading is also when they go. */
  private prune(now: number): void {
    for (const [address, entry] of this.entries) {
      if (now - entry.lastSeenAt >= WINDOW_MS) this.entries.delete(address)
    }
  }

  /** Keep the table bounded, dropping the least recently active entry. */
  private evict(): void {
    while (this.entries.size > MAX_DEVICES) {
      let oldest: string | undefined
      let oldestAt = Number.POSITIVE_INFINITY
      for (const [address, entry] of this.entries) {
        if (entry.lastSeenAt < oldestAt) {
          oldest = address
          oldestAt = entry.lastSeenAt
        }
      }
      if (oldest === undefined) return
      this.entries.delete(oldest)
    }
  }
}

/**
 * The name a client is listed under.
 *
 * A `User-Agent` is a list of products and comments — `VLC/3.0.20
 * LibVLC/3.0.20`, `Infuse/7.6.4 (iPhone; iOS 17.4)` — and the first product is
 * the one the client calls itself by, which is the one a person recognises.
 * Nothing usable is an empty name; the interface shows it as an unknown device.
 */
export function deviceName(userAgent: string | undefined): string {
  if (userAgent === undefined) return ''
  const first = userAgent.trim().split(/\s+/)[0] ?? ''
  return [...first].slice(0, NAME_LIMIT).join('')
}
