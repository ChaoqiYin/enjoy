import assert from 'node:assert/strict'
import test from 'node:test'
import { openLibrary } from './test-harness.ts'

test('directories are scoped to their space', async () => {
  const library = await openLibrary()
  try {
    await library.harness.request('POST', '/api/directories', { path: '/media/a' })
    await library.harness.request('POST', '/api/spaces', { name: 'Movies' })

    const current = await library.harness.request('GET', '/api/directories')
    assert.deepEqual(current.body, { directories: [] })

    const firstSpace = await library.harness.request('GET', '/api/directories?spaceId=1')
    assert.deepEqual(firstSpace.body, {
      directories: [{ id: 1, spaceId: 1, path: '/media/a' }],
    })

    const added = await library.harness.request('POST', '/api/directories', {
      path: '/media/b',
      spaceId: 1,
    })
    assert.equal(added.status, 201)
    assert.equal((added.body as { directory: { spaceId: number } }).directory.spaceId, 1)
  } finally {
    await library.close()
  }
})

test('POST /api/directories is idempotent for the same path in one space', async () => {
  const library = await openLibrary()
  try {
    await library.harness.request('POST', '/api/directories', { path: '/media/a' })
    const again = await library.harness.request('POST', '/api/directories', { path: '/media/a' })
    assert.equal(again.status, 201)
    assert.deepEqual(again.body, {
      directory: { id: 1, spaceId: 1, path: '/media/a' },
    })

    const list = await library.harness.request('GET', '/api/directories')
    assert.equal((list.body as { directories: unknown[] }).directories.length, 1)
  } finally {
    await library.close()
  }
})

test('DELETE /api/directories/:id removes a directory', async () => {
  const library = await openLibrary()
  try {
    await library.harness.request('POST', '/api/directories', { path: '/media/a' })
    const deleted = await library.harness.request('DELETE', '/api/directories/1')
    assert.equal(deleted.status, 200)
    assert.deepEqual(deleted.body, {
      directory: { id: 1, spaceId: 1, path: '/media/a' },
    })

    const list = await library.harness.request('GET', '/api/directories')
    assert.deepEqual(list.body, { directories: [] })

    const missing = await library.harness.request('DELETE', '/api/directories/99')
    assert.equal(missing.status, 404)
    assert.equal((missing.body as { code: string }).code, 'directory.not_found')
  } finally {
    await library.close()
  }
})

test('directory commands reject an empty path and an unknown space', async () => {
  const library = await openLibrary()
  try {
    const empty = await library.harness.request('POST', '/api/directories', { path: '  ' })
    assert.equal(empty.status, 400)
    assert.equal((empty.body as { code: string }).code, 'directory.path.empty')

    const missingSpace = await library.harness.request('GET', '/api/directories?spaceId=99')
    assert.equal(missingSpace.status, 404)
    assert.equal((missingSpace.body as { code: string }).code, 'space.not_found')
  } finally {
    await library.close()
  }
})

test('POST /api/directories adds a directory to the current space', async () => {
  const library = await openLibrary()
  try {
    const created = await library.harness.request('POST', '/api/directories', {
      path: '/media/movies',
    })
    assert.equal(created.status, 201)
    assert.deepEqual(created.body, {
      directory: { id: 1, spaceId: 1, path: '/media/movies' },
    })

    const list = await library.harness.request('GET', '/api/directories')
    assert.deepEqual(list.body, {
      directories: [{ id: 1, spaceId: 1, path: '/media/movies' }],
    })
  } finally {
    await library.close()
  }
})

test('directory paths must be absolute and are normalized before saving', async () => {
  const library = await openLibrary()
  try {
    const relative = await library.harness.request('POST', '/api/directories', {
      path: 'media/relative',
    })
    assert.equal(relative.status, 400)
    assert.equal((relative.body as { code: string }).code, 'directory.path.absolute')

    const normalized = await library.harness.request('POST', '/api/directories', {
      path: '/media/./movies/../shows/',
    })
    assert.equal(normalized.status, 201)
    assert.equal(
      (normalized.body as { directory: { path: string } }).directory.path,
      '/media/shows',
    )
  } finally {
    await library.close()
  }
})
