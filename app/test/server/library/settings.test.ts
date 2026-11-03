import assert from 'node:assert/strict'
import test from 'node:test'
import { openLibrary } from './test-harness.ts'

test('GET /api/settings starts empty', async () => {
  const library = await openLibrary()
  try {
    const response = await library.harness.request('GET', '/api/settings')
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { settings: {} })
  } finally {
    await library.close()
  }
})

test('PUT /api/settings merges values and the round trip reads them back', async () => {
  const library = await openLibrary()
  try {
    const first = await library.harness.request('PUT', '/api/settings', {
      settings: { theme: 'dark', volume: 0.5 },
    })
    assert.equal(first.status, 200)
    assert.deepEqual(first.body, { settings: { theme: 'dark', volume: 0.5 } })

    const second = await library.harness.request('PUT', '/api/settings', {
      settings: { volume: 0.8, updatedCheck: 'daily' },
    })
    assert.deepEqual(second.body, {
      settings: { theme: 'dark', volume: 0.8, updatedCheck: 'daily' },
    })

    const read = await library.harness.request('GET', '/api/settings')
    assert.deepEqual(read.body, {
      settings: { theme: 'dark', volume: 0.8, updatedCheck: 'daily' },
    })
  } finally {
    await library.close()
  }
})

test('PUT /api/settings rejects a body without a settings object', async () => {
  const library = await openLibrary()
  try {
    const response = await library.harness.request('PUT', '/api/settings', { settings: [] })
    assert.equal(response.status, 400)
    assert.equal((response.body as { code: string }).code, 'bad_request')
  } finally {
    await library.close()
  }
})
