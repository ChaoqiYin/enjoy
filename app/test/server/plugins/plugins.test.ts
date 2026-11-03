import assert from 'node:assert/strict'
import test from 'node:test'
import type { KernelContext } from 'cordis-app/server'
import { startHarness } from '../library/test-harness.ts'
import { installPlugins } from '../../../server/plugins/index.ts'

test('GET /api/plugins answers with the read-only catalogue', async () => {
  const harness = await startHarness((ctx) => {
    installPlugins(ctx as unknown as KernelContext)
  })
  try {
    const response = await harness.request('GET', '/api/plugins')
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { plugins: [] })
  } finally {
    await harness.close()
  }
})
