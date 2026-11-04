import assert from 'node:assert/strict'
import test from 'node:test'
import { DeviceActivity } from '../../../server/share/devices.ts'
import { basic, openSharingLibrary, webdavRequest } from './share-harness.ts'

interface DeviceBody {
  name: string
  address: string
  lastSeenAt: number
}

function devicesOf(body: unknown): DeviceBody[] {
  return (body as { devices: DeviceBody[] }).devices
}

test('an authenticated request is listed by its first product name, an anonymous one is not', async () => {
  const library = await openSharingLibrary()
  try {
    const opened = (await library.harness.request('POST', '/api/share/open')).body as {
      port: number
      password: string
    }

    const first = await webdavRequest(opened.port, 'GET', '/', {
      password: opened.password,
      headers: { 'user-agent': 'Infuse/7.6.4 (iPhone; iOS 17.4)' },
    })
    assert.equal(first.status, 200)

    let devices = devicesOf((await library.harness.request('GET', '/api/share/status')).body)
    assert.equal(devices.length, 1)
    assert.equal(devices[0]!.name, 'Infuse/7.6.4')
    assert.equal(devices[0]!.address, '127.0.0.1')
    assert.ok(Date.now() - devices[0]!.lastSeenAt < 60_000)

    const anonymous = await fetch(`http://127.0.0.1:${opened.port}/`, {
      headers: { 'user-agent': 'Scanner/1.0' },
    })
    assert.equal(anonymous.status, 401)
    devices = devicesOf((await library.harness.request('GET', '/api/share/status')).body)
    assert.equal(devices.length, 1)
    assert.equal(devices[0]!.name, 'Infuse/7.6.4')

    // The same address is the same device; a later name replaces the old one.
    await webdavRequest(opened.port, 'GET', '/', {
      password: opened.password,
      headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20' },
    })
    devices = devicesOf((await library.harness.request('GET', '/api/share/status')).body)
    assert.equal(devices.length, 1)
    assert.equal(devices[0]!.name, 'VLC/3.0.20')
  } finally {
    await library.close()
  }
})

test('devices are newest first, leave after a minute and stop at sixty-four', async () => {
  const clock = { now: 1_000_000 }
  const activity = new DeviceActivity({ now: () => clock.now })
  const library = await openSharingLibrary({ activity })
  try {
    const opened = await library.harness.request('POST', '/api/share/open')
    assert.equal(opened.status, 200)

    activity.record('192.168.1.20', 'Infuse/7.6.4')
    clock.now += 1_000
    activity.record('192.168.1.10', 'VLC/3.0.20')

    let devices = devicesOf((await library.harness.request('GET', '/api/share/status')).body)
    assert.deepEqual(
      devices.map((device) => [device.address, device.name, device.lastSeenAt]),
      [
        ['192.168.1.10', 'VLC/3.0.20', 1_001_000],
        ['192.168.1.20', 'Infuse/7.6.4', 1_000_000],
      ],
    )

    clock.now += 60_001
    devices = devicesOf((await library.harness.request('GET', '/api/share/status')).body)
    assert.deepEqual(devices, [])

    // A fresh window: seventy clients, one every millisecond. The oldest six
    // fall off the sixty-four-row cap, the newest stays first.
    for (let index = 0; index < 70; index += 1) {
      activity.record(`10.0.0.${index}`, `Client/${index}`)
      clock.now += 1
    }
    devices = devicesOf((await library.harness.request('GET', '/api/share/status')).body)
    assert.equal(devices.length, 64)
    assert.equal(devices[0]!.address, '10.0.0.69')
    assert.equal(devices.at(-1)!.address, '10.0.0.6')
    assert.ok(!devices.some((device) => device.address === '10.0.0.5'))
  } finally {
    await library.close()
  }
})

test('the challenge still comes before a device is recorded', async () => {
  const library = await openSharingLibrary()
  try {
    const opened = (await library.harness.request('POST', '/api/share/open')).body as {
      port: number
    }
    // A wrong password is not a client: it must not fill the list.
    const response = await webdavRequest(opened.port, 'GET', '/', {
      password: '0000',
      headers: { 'user-agent': 'Scanner/1.0' },
    })
    assert.equal(response.status, 401)
    assert.equal(
      devicesOf((await library.harness.request('GET', '/api/share/status')).body).length,
      0,
    )
    // The challenge helper stays the same shape clients expect.
    assert.match(response.headers.get('www-authenticate') ?? '', /^Basic realm="Enjoy"/)
    assert.equal(basic('0000').startsWith('Basic '), true)
  } finally {
    await library.close()
  }
})
