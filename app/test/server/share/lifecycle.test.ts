import assert from 'node:assert/strict'
import test from 'node:test'
import {
  makeTempDir,
  openWebdav,
  removeTempDir,
  writeVideo,
} from './harness.ts'

test('port 0 binds an ephemeral port and the reported port serves requests', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4')])
  try {
    assert.ok(webdav.port > 0)
    const response = await webdav.request('GET', '/clip.mp4')
    assert.equal(response.status, 200)
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('close is idempotent and releases the port for the next bind', async () => {
  const directory = makeTempDir()
  const first = await openWebdav([writeVideo(directory, 'clip.mp4')])
  const { port } = first
  await first.close()
  await first.close()

  const second = await openWebdav([], { port })
  try {
    assert.equal(second.port, port)
  } finally {
    await second.close()
    removeTempDir(directory)
  }
})
