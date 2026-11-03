import assert from 'node:assert/strict'
import test from 'node:test'
import { openLibrary } from './test-harness.ts'

test('space commands reject invalid names and unknown ids with shared error codes', async () => {
  const library = await openLibrary()
  try {
    const empty = await library.harness.request('POST', '/api/spaces', { name: '   ' })
    assert.equal(empty.status, 400)
    assert.equal((empty.body as { code: string }).code, 'space.name.empty')

    const tooLong = await library.harness.request('POST', '/api/spaces', { name: 'x'.repeat(25) })
    assert.equal(tooLong.status, 400)
    assert.equal((tooLong.body as { code: string }).code, 'space.name.too_long')

    await library.harness.request('POST', '/api/spaces', { name: 'Movies' })
    const taken = await library.harness.request('POST', '/api/spaces', { name: 'MOVIES' })
    assert.equal(taken.status, 409)
    assert.equal((taken.body as { code: string }).code, 'space.name.taken')

    const missing = await library.harness.request('PUT', '/api/spaces/99', { name: 'Name' })
    assert.equal(missing.status, 404)
    assert.equal((missing.body as { code: string }).code, 'space.not_found')

    const missingSwitch = await library.harness.request('POST', '/api/spaces/99/switch')
    assert.equal(missingSwitch.status, 404)

    const missingDelete = await library.harness.request('DELETE', '/api/spaces/99')
    assert.equal(missingDelete.status, 404)

    const badId = await library.harness.request('PUT', '/api/spaces/abc', { name: 'Name' })
    assert.equal(badId.status, 400)
    assert.equal((badId.body as { code: string }).code, 'bad_request')
  } finally {
    await library.close()
  }
})

test('DELETE /api/spaces/:id removes a space and moves the marker to the oldest one left', async () => {
  const library = await openLibrary()
  try {
    await library.harness.request('POST', '/api/spaces', { name: 'Movies' })

    const deleted = await library.harness.request('DELETE', '/api/spaces/2')
    assert.equal(deleted.status, 200)
    assert.deepEqual(deleted.body, {
      space: { id: 1, name: '默认空间', current: true },
    })

    const list = await library.harness.request('GET', '/api/spaces')
    assert.deepEqual(list.body, {
      spaces: [{ id: 1, name: '默认空间', current: true }],
    })

    const last = await library.harness.request('DELETE', '/api/spaces/1')
    assert.equal(last.status, 409)
    assert.equal((last.body as { code: string }).code, 'space.remove_last')
  } finally {
    await library.close()
  }
})

test('POST /api/spaces/:id/switch moves the current marker', async () => {
  const library = await openLibrary()
  try {
    await library.harness.request('POST', '/api/spaces', { name: 'Movies' })

    const switched = await library.harness.request('POST', '/api/spaces/1/switch')
    assert.equal(switched.status, 200)
    assert.deepEqual(switched.body, {
      space: { id: 1, name: '默认空间', current: true },
    })

    const list = await library.harness.request('GET', '/api/spaces')
    assert.deepEqual(list.body, {
      spaces: [
        { id: 1, name: '默认空间', current: true },
        { id: 2, name: 'Movies', current: false },
      ],
    })
  } finally {
    await library.close()
  }
})

test('PUT /api/spaces/:id renames a space without moving the marker', async () => {
  const library = await openLibrary()
  try {
    const renamed = await library.harness.request('PUT', '/api/spaces/1', { name: 'Library' })
    assert.equal(renamed.status, 200)
    assert.deepEqual(renamed.body, {
      space: { id: 1, name: 'Library', current: true },
    })

    const list = await library.harness.request('GET', '/api/spaces')
    assert.deepEqual(list.body, {
      spaces: [{ id: 1, name: 'Library', current: true }],
    })
  } finally {
    await library.close()
  }
})

test('POST /api/spaces creates a space and makes it current', async () => {
  const library = await openLibrary()
  try {
    const created = await library.harness.request('POST', '/api/spaces', { name: 'Movies' })
    assert.equal(created.status, 201)
    assert.deepEqual(created.body, {
      space: { id: 2, name: 'Movies', current: true },
    })

    const list = await library.harness.request('GET', '/api/spaces')
    assert.deepEqual(list.body, {
      spaces: [
        { id: 1, name: '默认空间', current: false },
        { id: 2, name: 'Movies', current: true },
      ],
    })
  } finally {
    await library.close()
  }
})

test('GET /api/spaces starts with one current space', async () => {
  const library = await openLibrary()
  try {
    const response = await library.harness.request('GET', '/api/spaces')
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, {
      spaces: [{ id: 1, name: '默认空间', current: true }],
    })
  } finally {
    await library.close()
  }
})
