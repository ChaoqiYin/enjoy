import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { seedVideos } from '../library/test-harness.ts'
import {
  canBind,
  makeVideoFile,
  occupyPortRun,
  openSharingLibrary,
  webdavRequest,
  type SharingLibrary,
} from './share-harness.ts'

interface ShareStatusBody {
  running: boolean
  port: number | null
  username: string
  password: string
  needsRestart: boolean
  listChanged: boolean
  pendingChanges: { added: string[]; removed: string[] }
  missingFiles: number
  devices: unknown[]
  addresses: string[]
}

function statusOf(body: unknown): ShareStatusBody {
  return body as ShareStatusBody
}

function codeOf(body: unknown): string {
  return (body as { code: string }).code
}

async function status(library: SharingLibrary): Promise<ShareStatusBody> {
  return statusOf((await library.harness.request('GET', '/api/share/status')).body)
}

/** Seed a shared video and, unless asked not to, put its file on disk. */
async function addSharedVideo(
  library: SharingLibrary,
  name: string,
  options: { directory?: string; onDisk?: boolean } = {},
): Promise<{ path: string; id: number }> {
  const directory = options.directory ?? join(library.dataDir, 'media')
  const path = join(directory, name)
  if (options.onDisk ?? true) makeVideoFile(directory, name)
  const ids = seedVideos(library.dataDir, [
    { spaceId: 1, path, fileName: name, folderPath: directory },
  ])
  const marked = await library.harness.request('PUT', `/api/videos/${ids[0]}/shared`, {
    shared: true,
  })
  assert.equal(marked.status, 200)
  return { path, id: ids[0]! }
}

function hrefsOf(xml: string): string[] {
  return [...xml.matchAll(/<D:href>([^<]*)<\/D:href>/g)].map((match) =>
    decodeURIComponent(match[1]!),
  )
}

async function propfindNames(port: number, password: string): Promise<string[]> {
  const response = await webdavRequest(port, 'PROPFIND', '/', {
    password,
    headers: { depth: '1' },
  })
  assert.equal(response.status, 207)
  return hrefsOf(await response.text())
}

test('status starts nothing and generates one four-digit password', async () => {
  const library = await openSharingLibrary()
  try {
    const first = await status(library)
    assert.equal(first.running, false)
    assert.equal(first.port, null)
    assert.equal(first.username, 'enjoy')
    assert.match(first.password, /^\d{4}$/)
    assert.equal(first.needsRestart, false)
    assert.equal(first.listChanged, false)
    assert.deepEqual(first.pendingChanges, { added: [], removed: [] })
    assert.equal(first.missingFiles, 0)
    assert.deepEqual(first.devices, [])
    assert.ok(!first.addresses.includes('127.0.0.1'))

    const second = await status(library)
    assert.equal(second.password, first.password)
    assert.equal(second.port, null)
  } finally {
    await library.close()
  }
})

test('a generated password survives a new server process', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'enjoy-cordis-share-persist-'))
  try {
    const first = await openSharingLibrary({ dataDir, removeDataDir: false })
    const password = (await status(first)).password
    await first.close()

    const second = await openSharingLibrary({ dataDir, removeDataDir: false })
    try {
      assert.equal((await status(second)).password, password)
    } finally {
      await second.close()
    }
  } finally {
    rmSync(dataDir, { recursive: true, force: true })
  }
})

test('open starts the listener over the shared list and close releases the port', async () => {
  const library = await openSharingLibrary()
  try {
    await addSharedVideo(library, 'clip.mp4')
    const opened = await library.harness.request('POST', '/api/share/open')
    assert.equal(opened.status, 200)
    const running = statusOf(opened.body)
    assert.equal(running.running, true)
    assert.ok(running.port !== null && running.port > 0)
    assert.equal(running.missingFiles, 0)

    const landing = await webdavRequest(running.port!, 'GET', '/', {
      password: running.password,
    })
    assert.equal(landing.status, 200)

    const closed = await library.harness.request('POST', '/api/share/close')
    const stopped = statusOf(closed.body)
    assert.equal(stopped.running, false)
    assert.equal(stopped.port, null)
    assert.equal(await canBind(running.port!), true)

    const again = await library.harness.request('POST', '/api/share/close')
    assert.equal(again.status, 200)
    assert.equal(statusOf(again.body).running, false)
  } finally {
    await library.close()
  }
})

test('an empty shared list can start, and the protocol exposes only the root', async () => {
  const library = await openSharingLibrary()
  try {
    const opened = await library.harness.request('POST', '/api/share/open')
    assert.equal(opened.status, 200)
    const running = statusOf(opened.body)
    assert.equal(running.running, true)
    assert.ok(running.port !== null)
    assert.deepEqual(await propfindNames(running.port!, running.password), ['/'])
  } finally {
    await library.close()
  }
})

test('opening twice answers share.already_running', async () => {
  const library = await openSharingLibrary()
  try {
    assert.equal((await library.harness.request('POST', '/api/share/open')).status, 200)
    const duplicate = await library.harness.request('POST', '/api/share/open')
    assert.equal(duplicate.status, 409)
    assert.equal(codeOf(duplicate.body), 'share.already_running')
  } finally {
    await library.close()
  }
})

test('ten occupied ports answer share.port_in_use', async () => {
  const run = await occupyPortRun(10)
  const library = await openSharingLibrary({ startPort: run.base })
  try {
    const failed = await library.harness.request('POST', '/api/share/open')
    assert.equal(failed.status, 409)
    assert.equal(codeOf(failed.body), 'share.port_in_use')
    assert.equal((await status(library)).running, false)
  } finally {
    await library.close()
    await run.release()
  }
})

test('a password reset is stored at once but only enforced after a restart', async () => {
  const library = await openSharingLibrary()
  try {
    const before = await status(library)
    const opened = statusOf((await library.harness.request('POST', '/api/share/open')).body)
    const port = opened.port!

    assert.equal(
      (await webdavRequest(port, 'GET', '/', { password: before.password })).status,
      200,
    )

    const reset = await library.harness.request('POST', '/api/share/password')
    const after = statusOf(reset.body)
    assert.equal(after.running, true)
    assert.match(after.password, /^\d{4}$/)
    assert.equal(after.needsRestart, true)
    assert.notEqual(after.password, before.password)

    // The running listener still knows the password it started with.
    assert.equal(
      (await webdavRequest(port, 'GET', '/', { password: before.password })).status,
      200,
    )
    assert.equal(
      (await webdavRequest(port, 'GET', '/', { password: after.password })).status,
      401,
    )

    await library.harness.request('POST', '/api/share/close')
    const reopened = statusOf((await library.harness.request('POST', '/api/share/open')).body)
    assert.equal(reopened.needsRestart, false)
    assert.equal(
      (await webdavRequest(reopened.port!, 'GET', '/', { password: before.password })).status,
      401,
    )
    assert.equal(
      (await webdavRequest(reopened.port!, 'GET', '/', { password: after.password })).status,
      200,
    )
  } finally {
    await library.close()
  }
})

test('pending changes name both directions and restart applies them', async () => {
  const library = await openSharingLibrary()
  try {
    const first = await addSharedVideo(library, 'a.mp4')
    const opened = statusOf((await library.harness.request('POST', '/api/share/open')).body)
    const port = opened.port!
    assert.deepEqual(await propfindNames(port, opened.password), ['/', '/a.mp4'])

    const second = await addSharedVideo(library, 'b.mp4')
    const changed = await status(library)
    assert.equal(changed.listChanged, true)
    assert.deepEqual(changed.pendingChanges, { added: [second.path], removed: [] })

    // The running snapshot is unchanged: the client never loses a file
    // underneath a playing television, and a new file is not half-offered.
    assert.deepEqual(await propfindNames(port, opened.password), ['/', '/a.mp4'])

    const restarted = await library.harness.request('POST', '/api/share/restart')
    assert.equal(restarted.status, 200)
    const current = statusOf(restarted.body)
    assert.equal(current.running, true)
    assert.equal(current.listChanged, false)
    assert.deepEqual(current.pendingChanges, { added: [], removed: [] })
    assert.deepEqual(await propfindNames(current.port!, current.password), [
      '/',
      '/a.mp4',
      '/b.mp4',
    ])

    // Removing a record is pending in the other direction: the snapshot keeps
    // serving the file until the service is restarted.
    const removed = await library.harness.request(
      'PUT',
      `/api/videos/${first.id}/shared`,
      { shared: false },
    )
    assert.equal(removed.status, 200)
    const afterRemoval = await status(library)
    assert.deepEqual(afterRemoval.pendingChanges, { added: [], removed: [first.path] })
    assert.deepEqual(await propfindNames(current.port!, current.password), [
      '/',
      '/a.mp4',
      '/b.mp4',
    ])

    const again = statusOf(
      (await library.harness.request('POST', '/api/share/restart')).body,
    )
    assert.deepEqual(again.pendingChanges, { added: [], removed: [] })
    assert.deepEqual(await propfindNames(again.port!, again.password), ['/', '/b.mp4'])
  } finally {
    await library.close()
  }
})

test('restarting while stopped is simply starting', async () => {
  const library = await openSharingLibrary()
  try {
    await addSharedVideo(library, 'a.mp4')
    const started = await library.harness.request('POST', '/api/share/restart')
    assert.equal(started.status, 200)
    const running = statusOf(started.body)
    assert.equal(running.running, true)
    assert.ok(running.port !== null)
    assert.deepEqual(await propfindNames(running.port!, running.password), ['/', '/a.mp4'])
  } finally {
    await library.close()
  }
})

test('missingFiles counts shared records whose file cannot be offered', async () => {
  const library = await openSharingLibrary()
  try {
    await addSharedVideo(library, 'present.mp4')
    await addSharedVideo(library, 'gone.mp4', { onDisk: false })

    const opened = statusOf((await library.harness.request('POST', '/api/share/open')).body)
    assert.equal(opened.missingFiles, 1)
    assert.deepEqual(await propfindNames(opened.port!, opened.password), ['/', '/present.mp4'])
  } finally {
    await library.close()
  }
})

test('a refused or no-op space command leaves the running service alone', async () => {
  const library = await openSharingLibrary()
  try {
    await addSharedVideo(library, 'clip.mp4')
    const opened = statusOf((await library.harness.request('POST', '/api/share/open')).body)
    assert.equal(opened.running, true)

    const duplicate = await library.harness.request('POST', '/api/spaces', {
      name: '默认空间',
    })
    assert.equal(duplicate.status, 409)
    assert.equal(codeOf(duplicate.body), 'space.name.taken')
    assert.equal((await status(library)).running, true)

    const last = await library.harness.request('DELETE', '/api/spaces/1')
    assert.equal(last.status, 409)
    assert.equal(codeOf(last.body), 'space.remove_last')
    assert.equal((await status(library)).running, true)

    const current = await library.harness.request('POST', '/api/spaces/1/switch')
    assert.equal(current.status, 200)
    assert.equal((await status(library)).running, true)

    // The listener itself is still serving, not just the state flag.
    assert.equal(
      (await webdavRequest(opened.port!, 'GET', '/', { password: opened.password }))
        .status,
      200,
    )
  } finally {
    await library.close()
  }
})

test('creating, switching and deleting a space stop the running service first', async () => {
  const library = await openSharingLibrary()
  try {
    // Creating a space moves the current marker to it.
    await addSharedVideo(library, 'clip.mp4')
    assert.equal((await library.harness.request('POST', '/api/share/open')).status, 200)
    const created = await library.harness.request('POST', '/api/spaces', { name: 'Movies' })
    assert.equal(created.status, 201)
    assert.equal((await status(library)).running, false)

    // Starting in space 2 and switching back to space 1 stops it.
    assert.equal((await library.harness.request('POST', '/api/share/open')).status, 200)
    const switched = await library.harness.request('POST', '/api/spaces/1/switch')
    assert.equal(switched.status, 200)
    assert.equal((await status(library)).running, false)

    // Deleting the space that is sharing stops it too.
    assert.equal((await library.harness.request('POST', '/api/spaces/2/switch')).status, 200)
    assert.equal((await library.harness.request('POST', '/api/share/open')).status, 200)
    const deleted = await library.harness.request('DELETE', '/api/spaces/2')
    assert.equal(deleted.status, 200)
    assert.equal((await status(library)).running, false)
  } finally {
    await library.close()
  }
})
