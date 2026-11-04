import assert from 'node:assert/strict'
import test from 'node:test'
import {
  makeTempDir,
  openWebdav,
  removeTempDir,
  writeVideo,
} from './webdav-harness.ts'

const CHALLENGE = 'Basic realm="Enjoy", charset="UTF-8"'

test('every request needs Basic credentials, including OPTIONS', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4')])
  try {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'PROPFIND']) {
      const response = await webdav.request(method, '/', { auth: false })
      assert.equal(response.status, 401, method)
      assert.equal(response.headers.get('www-authenticate'), CHALLENGE, method)
      assert.equal(response.body.length, 0, method)
    }

    const wrong = await webdav.request('GET', '/', {
      auth: { username: 'enjoy', password: '0000' },
    })
    assert.equal(wrong.status, 401)
    assert.equal(wrong.body.length, 0)

    const wrongUser = await webdav.request('GET', '/', {
      auth: { username: 'someone', password: '1234' },
    })
    assert.equal(wrongUser.status, 401)
    assert.equal(wrongUser.headers.get('www-authenticate'), CHALLENGE)
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('the root landing page follows Accept-Language, with the configured language as fallback', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4')], { language: 'zh-CN' })
  try {
    const chinese = await webdav.request('GET', '/', {
      headers: { 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' },
    })
    assert.equal(chinese.status, 200)
    assert.match(chinese.headers.get('content-type') ?? '', /^text\/html; charset=utf-8$/)
    assert.match(chinese.text, /分享/)

    const english = await webdav.request('GET', '/', {
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    })
    assert.equal(english.status, 200)
    assert.match(english.text, /shar/i)
    assert.doesNotMatch(english.text, /分享/)

    const fallback = await webdav.request('GET', '/')
    assert.match(fallback.text, /分享/)
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('HEAD the landing page answers the same headers without a body', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4')])
  try {
    const response = await webdav.request('HEAD', '/', {
      headers: { 'accept-language': 'en' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.body.length, 0)
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/)
    assert.ok(Number(response.headers.get('content-length')) > 0)
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})
