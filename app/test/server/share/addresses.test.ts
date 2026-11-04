import assert from 'node:assert/strict'
import test from 'node:test'
import type { NetworkInterfaces } from '../../../server/share/addresses.ts'
import { openSharingLibrary } from './share-harness.ts'

interface AddressBody {
  address: string
  loopback: boolean
}

function addressesOf(body: unknown): AddressBody[] {
  return (body as { addresses: AddressBody[] }).addresses
}

const INTERFACES: NetworkInterfaces = {
  lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  en0: [
    { address: '192.168.1.5', family: 'IPv4', internal: false },
    { address: 'fe80::1', family: 'IPv6', internal: false },
  ],
  en1: [
    { address: '203.0.113.9', family: 4, internal: false },
    { address: '169.254.3.7', family: 'IPv4', internal: false },
  ],
  utun: [{ address: '172.20.0.1', family: 'IPv4', internal: false }],
  any: [{ address: '0.0.0.0', family: 'IPv4', internal: false }],
  wired: [{ address: '10.0.0.5', family: 'IPv4', internal: false }],
}

test('addresses are IPv4 only, ordered private, link-local, public, loopback', async () => {
  const library = await openSharingLibrary({
    networkInterfaces: () => INTERFACES,
  })
  try {
    const response = await library.harness.request('GET', '/api/share/status')
    assert.equal(response.status, 200)
    assert.deepEqual(addressesOf(response.body), [
      { address: '10.0.0.5', loopback: false },
      { address: '172.20.0.1', loopback: false },
      { address: '192.168.1.5', loopback: false },
      { address: '169.254.3.7', loopback: false },
      { address: '203.0.113.9', loopback: false },
      { address: '127.0.0.1', loopback: true },
    ])
  } finally {
    await library.close()
  }
})

test('the loopback address is always present and only it is marked', async () => {
  const library = await openSharingLibrary({
    networkInterfaces: () => ({}),
  })
  try {
    const response = await library.harness.request('GET', '/api/share/status')
    assert.deepEqual(addressesOf(response.body), [
      { address: '127.0.0.1', loopback: true },
    ])
  } finally {
    await library.close()
  }
})
