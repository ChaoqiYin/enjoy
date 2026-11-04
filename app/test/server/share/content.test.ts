import assert from 'node:assert/strict'
import test from 'node:test'
import { unlinkSync } from 'node:fs'
import {
  makeTempDir,
  openWebdav,
  removeTempDir,
  writeVideo,
} from './webdav-harness.ts'

const BYTES = '0123456789'

test('GET serves the whole file with length, time, type, ETag and accepting ranges', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4', BYTES)])
  try {
    const response = await webdav.request('GET', '/clip.mp4')
    assert.equal(response.status, 200)
    assert.equal(response.text, BYTES)
    assert.equal(response.headers.get('content-length'), String(BYTES.length))
    assert.equal(response.headers.get('content-type'), 'video/mp4')
    assert.equal(response.headers.get('accept-ranges'), 'bytes')
    const etag = response.headers.get('etag')
    assert.match(etag ?? '', /^".+"$/)
    assert.ok(Number.isFinite(Date.parse(response.headers.get('last-modified') ?? '')))

    const again = await webdav.request('GET', '/clip.mp4')
    assert.equal(again.headers.get('etag'), etag)
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('HEAD answers the same headers as GET without a body', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4', BYTES)])
  try {
    const get = await webdav.request('GET', '/clip.mp4')
    const head = await webdav.request('HEAD', '/clip.mp4')
    assert.equal(head.status, 200)
    assert.equal(head.body.length, 0)
    for (const header of [
      'content-length',
      'content-type',
      'last-modified',
      'etag',
      'accept-ranges',
    ]) {
      assert.equal(head.headers.get(header), get.headers.get(header), header)
    }
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('single-byte ranges answer 206 with the requested slice', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4', BYTES)])
  try {
    const cases: [string, string, string][] = [
      ['bytes=0-3', '0123', 'bytes 0-3/10'],
      ['bytes=4-', '456789', 'bytes 4-9/10'],
      ['bytes=-3', '789', 'bytes 7-9/10'],
      ['bytes=0-100', BYTES, 'bytes 0-9/10'],
    ]
    for (const [range, expectedBody, expectedContentRange] of cases) {
      const response = await webdav.request('GET', '/clip.mp4', {
        headers: { range },
      })
      assert.equal(response.status, 206, range)
      assert.equal(response.text, expectedBody, range)
      assert.equal(response.headers.get('content-range'), expectedContentRange, range)
      assert.equal(response.headers.get('content-length'), String(expectedBody.length), range)
    }
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('multi-range requests fall back to the full 200 response', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4', BYTES)])
  try {
    const response = await webdav.request('GET', '/clip.mp4', {
      headers: { range: 'bytes=0-1,4-5' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.text, BYTES)
    assert.equal(response.headers.get('content-range'), null)
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('unsatisfiable ranges answer 416 with the total length', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4', BYTES)])
  try {
    for (const range of ['bytes=20-30', 'bytes=5-3', 'bytes=-0', 'bytes=abc', 'bytes=10-']) {
      const response = await webdav.request('GET', '/clip.mp4', {
        headers: { range },
      })
      assert.equal(response.status, 416, range)
      assert.equal(response.headers.get('content-range'), 'bytes */10', range)
    }
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('content type follows the extension and falls back to octet-stream', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([
    writeVideo(directory, 'movie.mkv', 'mkv'),
    writeVideo(directory, 'notes.unknown', 'text'),
  ])
  try {
    assert.equal(
      (await webdav.request('GET', '/movie.mkv')).headers.get('content-type'),
      'video/x-matroska',
    )
    assert.equal(
      (await webdav.request('GET', '/notes.unknown')).headers.get('content-type'),
      'application/octet-stream',
    )
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('an empty file is a zero-length 200 and any range is unsatisfiable', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'empty.mp4', '')])
  try {
    const whole = await webdav.request('GET', '/empty.mp4')
    assert.equal(whole.status, 200)
    assert.equal(whole.body.length, 0)
    assert.equal(whole.headers.get('content-length'), '0')

    const range = await webdav.request('GET', '/empty.mp4', {
      headers: { range: 'bytes=0-' },
    })
    assert.equal(range.status, 416)
    assert.equal(range.headers.get('content-range'), 'bytes */0')
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('a file deleted after startup answers 404 while the listing keeps its name', async () => {
  const directory = makeTempDir()
  const path = writeVideo(directory, 'clip.mp4', BYTES)
  const webdav = await openWebdav([path])
  try {
    unlinkSync(path)
    const get = await webdav.request('GET', '/clip.mp4')
    assert.equal(get.status, 404)
    const head = await webdav.request('HEAD', '/clip.mp4')
    assert.equal(head.status, 404)
    const propfindDepthZero = await webdav.request('PROPFIND', '/clip.mp4', {
      headers: { depth: '0' },
    })
    assert.equal(propfindDepthZero.status, 404)
    const propfindDefault = await webdav.request('PROPFIND', '/clip.mp4')
    assert.equal(propfindDefault.status, 404)

    const listing = await webdav.request('PROPFIND', '/', { headers: { depth: '1' } })
    assert.match(listing.text, /\/clip\.mp4/)
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})
