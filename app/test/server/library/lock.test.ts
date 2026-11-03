import assert from 'node:assert/strict'
import test from 'node:test'
import { openLibrary } from './test-harness.ts'

test('space write commands return space.blocked.scanning while a scan owns the slot', async () => {
  const library = await openLibrary()
  try {
    library.scanning.active = true

    const commands: [string, string, unknown?][] = [
      ['POST', '/api/spaces', { name: 'Movies' }],
      ['PUT', '/api/spaces/1', { name: 'Library' }],
      ['DELETE', '/api/spaces/1'],
      ['POST', '/api/spaces/1/switch'],
    ]

    for (const [method, path, body] of commands) {
      const response = await library.harness.request(method, path, body)
      assert.equal(response.status, 409, `${method} ${path}`)
      assert.deepEqual(response.body, {
        code: 'space.blocked.scanning',
        message: 'A scan is using the library',
      })
    }

    const list = await library.harness.request('GET', '/api/spaces')
    assert.deepEqual(list.body, {
      spaces: [{ id: 1, name: '默认空间', current: true }],
    })
  } finally {
    await library.close()
  }
})
