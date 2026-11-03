import assert from 'node:assert/strict'
import test from 'node:test'
import type { KernelContext } from 'cordis-app/server'
import { startHarness } from '../library/test-harness.ts'
import { registerMediaRoutes } from '../../../server/scan/media-routes.ts'

test('GET /api/media/tools reports each tool path or null', async () => {
  const harness = await startHarness((ctx) => {
    registerMediaRoutes(ctx as unknown as KernelContext, () => ({
      ffmpeg: '/opt/homebrew/bin/ffmpeg',
      ffprobe: null,
    }))
  })
  try {
    const response = await harness.request('GET', '/api/media/tools')
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, {
      ffmpeg: '/opt/homebrew/bin/ffmpeg',
      ffprobe: null,
    })
  } finally {
    await harness.close()
  }
})
