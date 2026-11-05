import assert from 'node:assert/strict'
import test from 'node:test'
import type { NetworkInterfaces } from '../../../server/share/addresses.ts'
import { openSharingLibrary } from './share-harness.ts'

function addressesOf(body: unknown): string[] {
  return (body as { addresses: string[] }).addresses
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
  // What macOS internet sharing or a virtual machine leaves behind: a real
  // address on a bridge, but not one the television is on.
  bridge100: [{ address: '192.168.64.1', family: 'IPv4', internal: false }],
  docker0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
}

test('only addresses a television can be pointed at are listed, private first', async () => {
  const library = await openSharingLibrary({
    networkInterfaces: () => INTERFACES,
  })
  try {
    const response = await library.harness.request('GET', '/api/share/status')
    assert.equal(response.status, 200)
    assert.deepEqual(addressesOf(response.body), [
      '10.0.0.5',
      '192.168.1.5',
      '203.0.113.9',
    ])
  } finally {
    await library.close()
  }
})

test('with no usable interface the list is empty rather than inventing one', async () => {
  const library = await openSharingLibrary({
    networkInterfaces: () => ({
      lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      bridge100: [{ address: '192.168.64.1', family: 'IPv4', internal: false }],
    }),
  })
  try {
    const response = await library.harness.request('GET', '/api/share/status')
    assert.deepEqual(addressesOf(response.body), [])
  } finally {
    await library.close()
  }
})
