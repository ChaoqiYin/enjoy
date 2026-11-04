/**
 * The IPv4 addresses this machine can be reached at, in the order a person
 * should try them.
 *
 * A service listens on every interface, so what is left is to say where it can
 * be reached: private addresses first (the one a router hands out), then a
 * link-local address, then anything public, and this machine talking to itself
 * last. Within a kind the order is by address so two readings agree.
 */

import { networkInterfaces } from 'node:os'

export interface ShareAddress {
  address: string
  /** Whether this address only reaches the machine it is read on. */
  loopback: boolean
}

export interface NetworkAddress {
  address: string
  family: string | number
  internal: boolean
}

/** The shape `os.networkInterfaces()` answers with, narrowed for injection. */
export type NetworkInterfaces = Record<string, NetworkAddress[] | undefined>

/** Every address this machine holds, most likely to be the one to use first. */
export function machineAddresses(
  interfaces: NetworkInterfaces = networkInterfaces(),
): ShareAddress[] {
  const found = new Set<string>()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (!isIpv4Family(entry.family)) continue
      // An internal address is the machine talking to itself; the loopback
      // address is added below whether or not the operating system reports it.
      if (entry.internal) continue
      found.add(entry.address)
    }
  }
  // The listener always binds on `0.0.0.0`, so at least this one works here.
  found.add('127.0.0.1')
  // The wildcard is not an address a client can type into anything.
  found.delete('0.0.0.0')

  return [...found]
    .sort((left, right) => rank(left) - rank(right) || compare(left, right))
    .map((address) => ({ address, loopback: isLoopback(address) }))
}

function isIpv4Family(family: string | number): boolean {
  return family === 4 || family === 'IPv4'
}

function isLoopback(address: string): boolean {
  return address.startsWith('127.')
}

/**
 * Where an address belongs in the order.
 *
 * Private networks are what a house is made of. A link-local address is what a
 * machine gives itself when the network did not hand one out, so it is worth a
 * try before anything more unusual. A public address is reachable from more
 * than the house and is not what this feature is for, but it might still work.
 * Loopback cannot reach a television from anywhere and stays last.
 */
function rank(address: string): number {
  const octets = address.split('.').map(Number)
  const [first, second] = octets
  if (first === undefined || second === undefined) return 2
  if (first === 127) return 3
  if (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  ) {
    return 0
  }
  if (first === 169 && second === 254) return 1
  return 2
}

/** Plain lexical order: the list must be stable, not locale-sensitive. */
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
