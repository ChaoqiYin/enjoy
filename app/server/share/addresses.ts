/**
 * The IPv4 addresses a television can be pointed at, in the order a person
 * should try them.
 *
 * The service listens on every interface, but not every address is a way to
 * reach it from the room: loopback only reaches this machine, a link-local
 * address is what a machine keeps when the network did not hand one out, and a
 * bridge or tunnel is created by the system or by virtualisation software. What
 * remains is what belongs in the television's WebDAV source. Private addresses
 * come first (the one a router hands out), then anything public.
 */

import { networkInterfaces } from 'node:os'

export interface NetworkAddress {
  address: string
  family: string | number
  internal: boolean
}

/** The shape `os.networkInterfaces()` answers with, narrowed for injection. */
export type NetworkInterfaces = Record<string, NetworkAddress[] | undefined>

/**
 * Interface names that are not a path to a television.
 *
 * There is no portable "is virtual" flag on an interface, so the name is what
 * is left: bridges and tunnels (`bridge100`, `utun3`, `tun0`), operating-system
 * virtual adapters (`awdl0`, `anpi0`), and the ones virtualization tools add
 * (`vmnet1`, `vboxnet0`, `docker0`, `vEthernet`, `VMware`, `VirtualBox`).
 */
const NOT_A_TELEVISION_PATH =
  /^(bridge|utun|ipsec|gif|stf|awdl|llw|anpi|ap\d|p2p|vmenet|vmnet|vboxnet|docker|br-|veth|virbr|tun|tap|wg|zt|tailscale|vEthernet|VMware|VirtualBox|Npcap|Loopback)/i

/** Every address a television can be pointed at, most likely first. */
export function machineAddresses(
  interfaces: NetworkInterfaces = networkInterfaces(),
): string[] {
  const found = new Set<string>()
  for (const [name, entries] of Object.entries(interfaces)) {
    if (NOT_A_TELEVISION_PATH.test(name)) continue
    for (const entry of entries ?? []) {
      if (!isIpv4Family(entry.family)) continue
      if (entry.internal) continue
      if (!isClientAddress(entry.address)) continue
      found.add(entry.address)
    }
  }
  return [...found].sort((left, right) => rank(left) - rank(right) || compare(left, right))
}

function isIpv4Family(family: string | number): boolean {
  return family === 4 || family === 'IPv4'
}

/** Whether a client elsewhere could type this address into its source dialog. */
function isClientAddress(address: string): boolean {
  const octets = address.split('.').map(Number)
  const [first, second] = octets
  if (first === undefined || second === undefined) return false
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false
  }
  if (first === 127) return false // this machine talking to itself
  if (first === 169 && second === 254) return false // link-local, nobody else is here
  if (first === 0) return false // unspecified; nothing can be typed into a client
  return true
}

/**
 * Where an address belongs in the order.
 *
 * Private networks are what a house is made of, and the address a router hands
 * out is the normal answer. A public address is reachable from more than the
 * house and is not what this feature is for, but it might still work.
 */
function rank(address: string): number {
  const [first, second] = address.split('.').map(Number)
  if (first === undefined || second === undefined) return 2
  if (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  ) {
    return 0
  }
  return 1
}

/** Plain lexical order: the list must be stable, not locale-sensitive. */
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
