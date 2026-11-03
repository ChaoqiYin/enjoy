import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { openScanningLibrary, type ScanningLibrary } from './test-harness.ts'

// These cases are about discovery and the index write. The media phases have
// their own integration tests; pointing the two tools at a missing path keeps
// thousands of fixture files from starting two processes each.
process.env.ENJOY_FFMPEG = join(tmpdir(), 'enjoy-cordis-missing-tools', 'ffmpeg')
process.env.ENJOY_FFPROBE = join(tmpdir(), 'enjoy-cordis-missing-tools', 'ffprobe')

const TERMINAL = new Set(['done', 'cancelled', 'failed'])

interface StatusBody {
  active: boolean
  scanId?: string
  spaceId?: number
  phase?: string
  changes?: { added: number; updated: number; removed: number }
  discovered?: number
  processed?: number
  indexed?: number
  failures?: number
  unreachableDirectories?: number
}

interface VideoRow {
  path: string
  file_name: string
  folder_path: string
  file_size: number
  modified_at: number
}

/** Poll the status endpoint until the slot is free and a terminal phase is recorded. */
async function waitForTerminal(
  library: ScanningLibrary,
  spaceId = 1,
  timeoutMs = 20_000,
): Promise<StatusBody> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const response = await library.harness.request(
      'GET',
      `/api/scan/status?spaceId=${spaceId}`,
    )
    const body = response.body as StatusBody
    if (response.status === 200 && !body.active && body.phase && TERMINAL.has(body.phase)) {
      return body
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('scan did not reach a terminal phase')
}

/** Read the index through a second connection; the main one is still open. */
function videoRows(dataDir: string): VideoRow[] {
  const db = new DatabaseSync(join(dataDir, 'library.db'))
  try {
    return db
      .prepare(
        'SELECT path, file_name, folder_path, file_size, modified_at FROM videos ORDER BY path',
      )
      .all() as unknown as VideoRow[]
  } finally {
    db.close()
  }
}

function makeVideo(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, 'video')
}

/** Enough entries that a pause request lands before the scan finishes. */
function populate(root: string, directories: number, perDirectory: number): number {
  let count = 0
  for (let directory = 0; directory < directories; directory += 1) {
    const dir = join(root, `d${directory}`)
    mkdirSync(dir, { recursive: true })
    for (let file = 0; file < perDirectory; file += 1) {
      writeFileSync(join(dir, `v${file}.mp4`), 'v')
      count += 1
    }
  }
  return count
}

test('a new video file is indexed and the status reaches done', async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    mkdirSync(root, { recursive: true })
    makeVideo(join(root, 'new.mp4'))

    await library.harness.request('POST', '/api/directories', { path: root })

    const started = await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    assert.equal(started.status, 202)
    assert.equal(typeof (started.body as { scanId: string }).scanId, 'string')

    const final = await waitForTerminal(library)
    assert.equal(final.phase, 'done')
    assert.deepEqual(final.changes, { added: 1, updated: 0, removed: 0 })
    assert.equal(final.discovered, 1)
    assert.equal(final.indexed, 1)

    const rows = videoRows(library.dataDir)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].path, join(root, 'new.mp4'))
    assert.equal(rows[0].file_name, 'new.mp4')
    assert.equal(rows[0].folder_path, root)

    // The scan's rows are what the video listing serves.
    const listed = await library.harness.request('GET', '/api/videos?spaceId=1')
    assert.equal((listed.body as { total: number }).total, 1)
    assert.equal(
      (listed.body as { videos: { path: string }[] }).videos[0].path,
      join(root, 'new.mp4'),
    )

    assert.ok(
      library.broadcasts.some((entry) => entry.channel === 'scan'),
      'progress is published on the scan channel',
    )
  } finally {
    await library.close()
  }
})

test('a deleted file is removed on the next scan', async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    mkdirSync(root, { recursive: true })
    makeVideo(join(root, 'keep.mp4'))
    makeVideo(join(root, 'gone.mp4'))
    await library.harness.request('POST', '/api/directories', { path: root })

    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const first = await waitForTerminal(library)
    assert.equal(first.phase, 'done')
    assert.deepEqual(first.changes, { added: 2, updated: 0, removed: 0 })

    rmSync(join(root, 'gone.mp4'))

    const secondStart = await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    assert.equal(secondStart.status, 202)
    const second = await waitForTerminal(library)
    assert.equal(second.phase, 'done')
    assert.deepEqual(second.changes, { added: 0, updated: 0, removed: 1 })
    assert.deepEqual(
      videoRows(library.dataDir).map((row) => row.file_name),
      ['keep.mp4'],
    )
  } finally {
    await library.close()
  }
})

test('a subdirectory that disappeared has its records cleared', async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    const sub = join(root, 'sub')
    makeVideo(join(sub, 'clip.mp4'))
    await library.harness.request('POST', '/api/directories', { path: root })

    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    await waitForTerminal(library)
    assert.equal(videoRows(library.dataDir).length, 1)

    rmSync(sub, { recursive: true, force: true })

    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const final = await waitForTerminal(library)
    assert.equal(final.phase, 'done')
    assert.deepEqual(final.changes, { added: 0, updated: 0, removed: 1 })
    assert.equal(videoRows(library.dataDir).length, 0)
  } finally {
    await library.close()
  }
})

test('a configured root that disappeared has its records cleared', async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    makeVideo(join(root, 'nested', 'clip.mp4'))
    await library.harness.request('POST', '/api/directories', { path: root })

    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    await waitForTerminal(library)
    assert.equal(videoRows(library.dataDir).length, 1)

    rmSync(root, { recursive: true, force: true })

    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const final = await waitForTerminal(library)
    assert.equal(final.phase, 'done')
    assert.deepEqual(final.changes, { added: 0, updated: 0, removed: 1 })
    assert.equal(final.unreachableDirectories, 0)
    assert.equal(videoRows(library.dataDir).length, 0)
  } finally {
    await library.close()
  }
})

test('an unreadable directory keeps its records and is counted as a failure', async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    const locked = join(root, 'locked')
    makeVideo(join(locked, 'inside.mp4'))
    makeVideo(join(root, 'open', 'outside.mp4'))
    await library.harness.request('POST', '/api/directories', { path: root })

    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    await waitForTerminal(library)
    assert.equal(videoRows(library.dataDir).length, 2)

    chmodSync(locked, 0o000)
    try {
      await library.harness.request('POST', '/api/scan', { spaceId: 1 })
      const final = await waitForTerminal(library)
      assert.equal(final.phase, 'done')
      assert.deepEqual(final.changes, { added: 0, updated: 0, removed: 0 })
      assert.ok((final.failures ?? 0) >= 1)
      // The configured root itself was readable; only a subtree was not.
      assert.equal(final.unreachableDirectories, 0)
      assert.deepEqual(
        videoRows(library.dataDir).map((row) => row.file_name).sort(),
        ['inside.mp4', 'outside.mp4'],
      )
    } finally {
      chmodSync(locked, 0o755)
    }
  } finally {
    await library.close()
  }
})

test('a configured path that is no longer a directory keeps its records', async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    makeVideo(join(root, 'clip.mp4'))
    await library.harness.request('POST', '/api/directories', { path: root })

    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    await waitForTerminal(library)
    assert.equal(videoRows(library.dataDir).length, 1)

    rmSync(root, { recursive: true, force: true })
    writeFileSync(root, 'not a directory')

    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const final = await waitForTerminal(library)
    assert.equal(final.phase, 'done')
    assert.deepEqual(final.changes, { added: 0, updated: 0, removed: 0 })
    assert.equal(final.unreachableDirectories, 0)
    assert.equal(videoRows(library.dataDir).length, 1)
  } finally {
    await library.close()
  }
})

test('status is inactive before any scan', async () => {
  const library = await openScanningLibrary()
  try {
    const response = await library.harness.request('GET', '/api/scan/status?spaceId=1')
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { active: false })
  } finally {
    await library.close()
  }
})

test('progress is broadcast on the scan channel in the documented shape', async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    makeVideo(join(root, 'clip.mp4'))
    await library.harness.request('POST', '/api/directories', { path: root })
    const started = await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const scanId = (started.body as { scanId: string }).scanId
    await waitForTerminal(library)

    const messages = library.broadcasts.filter((entry) => entry.channel === 'scan')
    assert.ok(messages.length >= 1)
    for (const entry of messages) assert.equal(entry.message.type, 'scan')

    const phases = messages.map(
      (entry) => (entry.message.data as { phase: string }).phase,
    )
    assert.ok(phases.includes('discovering'))
    assert.ok(phases.includes('done'))

    const sample = messages[0].message.data as Record<string, unknown>
    assert.equal(sample.scanId, scanId)
    assert.equal(sample.spaceId, 1)
    assert.equal(typeof sample.phase, 'string')
    assert.deepEqual(sample.changes, { added: 0, updated: 0, removed: 0 })
    for (const key of [
      'failures',
      'unreachableDirectories',
      'discovered',
      'processed',
      'indexed',
      'metadataReady',
      'thumbnailsReady',
    ]) {
      assert.equal(typeof sample[key], 'number', key)
    }
    assert.equal(typeof sample.currentPath, 'string')
  } finally {
    await library.close()
  }
})

test('a running scan can be paused, blocks space commands, then resume to done', async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    const total = populate(root, 10, 500)
    await library.harness.request('POST', '/api/directories', { path: root })

    const started = await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    assert.equal(started.status, 202)
    const scanId = (started.body as { scanId: string }).scanId

    const paused = await library.harness.request('POST', `/api/scan/${scanId}/pause`)
    assert.equal(paused.status, 202)
    assert.equal((paused.body as { phase: string }).phase, 'paused')

    const pauseAgain = await library.harness.request('POST', `/api/scan/${scanId}/pause`)
    assert.equal(pauseAgain.status, 409)
    assert.equal((pauseAgain.body as { code: string }).code, 'scan.not_running')

    const status = await library.harness.request('GET', '/api/scan/status?spaceId=1')
    assert.equal((status.body as StatusBody).active, true)
    assert.equal((status.body as StatusBody).phase, 'paused')

    const blockedCommands: [string, string, unknown?][] = [
      ['POST', '/api/spaces', { name: 'Blocked' }],
      ['PUT', '/api/spaces/1', { name: 'Renamed' }],
      ['POST', '/api/spaces/1/switch'],
      ['DELETE', '/api/spaces/1'],
    ]
    for (const [method, path, body] of blockedCommands) {
      const blocked = await library.harness.request(method, path, body)
      assert.equal(blocked.status, 409, `${method} ${path}`)
      assert.equal((blocked.body as { code: string }).code, 'space.blocked.scanning')
    }

    // A second scan cannot take the slot while the first is paused.
    const second = await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    assert.equal(second.status, 409)
    assert.equal((second.body as { code: string }).code, 'scan.already_active')

    const resumed = await library.harness.request('POST', `/api/scan/${scanId}/resume`)
    assert.equal(resumed.status, 202)
    assert.notEqual((resumed.body as { phase: string }).phase, 'paused')

    const final = await waitForTerminal(library)
    assert.equal(final.phase, 'done')
    assert.deepEqual(final.changes, { added: total, updated: 0, removed: 0 })
    assert.equal(videoRows(library.dataDir).length, total)
  } finally {
    await library.close()
  }
})

test('a running scan can be cancelled and releases the slot', async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    populate(root, 10, 500)
    await library.harness.request('POST', '/api/directories', { path: root })

    const started = await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    assert.equal(started.status, 202)
    const scanId = (started.body as { scanId: string }).scanId

    const duplicate = await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    assert.equal(duplicate.status, 409)
    assert.equal((duplicate.body as { code: string }).code, 'scan.already_active')

    const cancelled = await library.harness.request('POST', `/api/scan/${scanId}/cancel`)
    assert.equal(cancelled.status, 202)

    const final = await waitForTerminal(library)
    assert.equal(final.phase, 'cancelled')
    assert.equal(videoRows(library.dataDir).length, 0)

    const after = await library.harness.request('GET', '/api/scan/status?spaceId=1')
    assert.equal((after.body as StatusBody).active, false)
    assert.equal((after.body as StatusBody).phase, 'cancelled')

    // The slot is free again.
    const restart = await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    assert.equal(restart.status, 202)
    await waitForTerminal(library)
  } finally {
    await library.close()
  }
})

test('pause and resume reject an unknown scan and an invalid transition', async () => {
  const library = await openScanningLibrary()
  try {
    const missing = await library.harness.request('POST', '/api/scan/nope/pause')
    assert.equal(missing.status, 404)
    assert.equal((missing.body as { code: string }).code, 'scan.not_found')

    const root = join(library.dataDir, 'media')
    populate(root, 10, 500)
    await library.harness.request('POST', '/api/directories', { path: root })
    const started = await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const scanId = (started.body as { scanId: string }).scanId

    const resumeWhileRunning = await library.harness.request(
      'POST',
      `/api/scan/${scanId}/resume`,
    )
    assert.equal(resumeWhileRunning.status, 409)
    assert.equal((resumeWhileRunning.body as { code: string }).code, 'scan.not_paused')

    await library.harness.request('POST', `/api/scan/${scanId}/cancel`)
    await waitForTerminal(library)
  } finally {
    await library.close()
  }
})

interface MembershipRow {
  space_id: number
  directory_path: string
  video_id: number
}

/** Read the configured-directory membership rows through a second connection. */
function membershipRows(dataDir: string): MembershipRow[] {
  const db = new DatabaseSync(join(dataDir, 'library.db'))
  try {
    const rows = db
      .prepare(
        'SELECT space_id, directory_path, video_id FROM directory_videos ORDER BY video_id',
      )
      .all() as unknown as MembershipRow[]
    return rows.map((row) => ({
      space_id: row.space_id,
      directory_path: row.directory_path,
      video_id: row.video_id,
    }))
  } finally {
    db.close()
  }
}

test('the index records which configured root owns each file and clears it with the record', async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    makeVideo(join(root, 'nested', 'clip.mp4'))
    await library.harness.request('POST', '/api/directories', { path: root })

    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const first = await waitForTerminal(library)
    assert.equal(first.phase, 'done')

    const videos = videoRows(library.dataDir)
    assert.equal(videos.length, 1)
    const listed = await library.harness.request('GET', '/api/videos?spaceId=1')
    const videoId = (listed.body as { videos: { id: number }[] }).videos[0]!.id
    assert.deepEqual(membershipRows(library.dataDir), [
      { space_id: 1, directory_path: root, video_id: videoId },
    ])

    rmSync(root, { recursive: true, force: true })
    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const second = await waitForTerminal(library)
    assert.equal(second.phase, 'done')

    assert.equal(videoRows(library.dataDir).length, 0)
    assert.deepEqual(membershipRows(library.dataDir), [])
  } finally {
    await library.close()
  }
})
