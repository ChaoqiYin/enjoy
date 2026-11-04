import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { openScanningLibrary, waitForTerminal } from './test-harness.ts'

// This case is about the index write, not the media phases; pointing the tools
// at a missing path keeps fixture files from starting two processes each.
process.env.ENJOY_FFMPEG = join(tmpdir(), 'enjoy-cordis-missing-tools', 'ffmpeg')
process.env.ENJOY_FFPROBE = join(tmpdir(), 'enjoy-cordis-missing-tools', 'ffprobe')

function makeVideo(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, 'video')
}

test('a shared mark survives a file identity change and leaves with a removed record', async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    const path = join(root, 'clip.mp4')
    makeVideo(path)
    await library.harness.request('POST', '/api/directories', { path: root })

    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    await waitForTerminal(library)
    const listed = await library.harness.request('GET', '/api/videos?spaceId=1')
    const videoId = (listed.body as { videos: { id: number }[] }).videos[0]!.id

    const marked = await library.harness.request('PUT', `/api/videos/${videoId}/shared`, {
      shared: true,
    })
    assert.equal(marked.status, 200)

    // A different size is a file identity change: the metadata is processed
    // again, but the mark belongs to the record and stays.
    writeFileSync(path, 'a different payload')
    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const refreshed = await waitForTerminal(library)
    assert.deepEqual(refreshed.changes, { added: 0, updated: 1, removed: 0 })
    const afterRefresh = await library.harness.request('GET', '/api/videos?only=shared')
    assert.deepEqual(
      (afterRefresh.body as { videos: { id: number }[] }).videos.map((video) => video.id),
      [videoId],
    )

    // When the file is gone, the record and its mark go with it.
    rmSync(path)
    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const removed = await waitForTerminal(library)
    assert.deepEqual(removed.changes, { added: 0, updated: 0, removed: 1 })
    const empty = await library.harness.request('GET', '/api/videos?only=shared')
    assert.deepEqual(empty.body, { videos: [], total: 0 })

    // Scanning the same path back creates an unshared record.
    makeVideo(path)
    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const readded = await waitForTerminal(library)
    assert.deepEqual(readded.changes, { added: 1, updated: 0, removed: 0 })
    const fresh = await library.harness.request('GET', '/api/videos')
    assert.equal((fresh.body as { videos: { shared: boolean }[] }).videos[0]!.shared, false)
  } finally {
    await library.close()
  }
})
