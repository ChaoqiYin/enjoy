import assert from 'node:assert/strict'
import test from 'node:test'
import {
  makeTempDir,
  openWebdav,
  removeTempDir,
  writeVideo,
} from './webdav-harness.ts'

function hrefs(xml: string): string[] {
  const found: string[] = []
  for (const match of xml.matchAll(/<D:href>([^<]*)<\/D:href>/g)) {
    found.push(decodeURIComponent(match[1]!))
  }
  return found
}

function count(xml: string, element: string): number {
  return xml.split(`<D:${element}`).length - 1
}

test('OPTIONS advertises DAV level 1 and the read-only method set', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4')])
  try {
    const response = await webdav.request('OPTIONS', '/')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('dav'), '1')
    assert.equal(response.headers.get('ms-author-via'), 'DAV')
    const allow = response.headers.get('allow') ?? ''
    for (const method of ['OPTIONS', 'PROPFIND', 'GET', 'HEAD']) {
      assert.match(allow, new RegExp(`\\b${method}\\b`))
    }
    for (const method of ['PUT', 'DELETE', 'MKCOL', 'MOVE', 'COPY', 'LOCK']) {
      assert.doesNotMatch(allow, new RegExp(`\\b${method}\\b`))
    }
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('PROPFIND on the root honours Depth 0, Depth 1 and a missing Depth header', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([
    writeVideo(directory, 'beta.mkv'),
    writeVideo(directory, 'alpha.mp4'),
  ])
  try {
    const depthZero = await webdav.request('PROPFIND', '/', {
      headers: { depth: '0' },
    })
    assert.equal(depthZero.status, 207)
    assert.match(depthZero.headers.get('content-type') ?? '', /^application\/xml/)
    assert.deepEqual(hrefs(depthZero.text), ['/'])
    assert.match(depthZero.text, /<D:collection\/>/)

    const depthOne = await webdav.request('PROPFIND', '/', {
      headers: { depth: '1' },
    })
    assert.equal(depthOne.status, 207)
    assert.deepEqual(hrefs(depthOne.text).sort(), ['/', '/alpha.mp4', '/beta.mkv'])

    const defaulted = await webdav.request('PROPFIND', '/')
    assert.equal(defaulted.status, 207)
    assert.deepEqual(hrefs(defaulted.text).sort(), ['/', '/alpha.mp4', '/beta.mkv'])
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('PROPFIND on a file answers itself for Depth 0 and Depth 1', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4')])
  try {
    for (const depth of ['0', '1']) {
      const response = await webdav.request('PROPFIND', '/clip.mp4', {
        headers: { depth },
      })
      assert.equal(response.status, 207)
      assert.deepEqual(hrefs(response.text), ['/clip.mp4'])
    }
    const defaulted = await webdav.request('PROPFIND', '/clip.mp4')
    assert.deepEqual(hrefs(defaulted.text), ['/clip.mp4'])
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('PROPFIND rejects Depth infinity and unknown names', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4')])
  try {
    const infinity = await webdav.request('PROPFIND', '/', {
      headers: { depth: 'infinity' },
    })
    assert.equal(infinity.status, 403)
    assert.match(infinity.text, /propfind-finite-depth/)

    const missing = await webdav.request('PROPFIND', '/nope.mp4', {
      headers: { depth: '0' },
    })
    assert.equal(missing.status, 404)
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('PROPFIND reports the fixed property set and URL-encodes hrefs', async () => {
  const name = '中文 名称 & #1.mp4'
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, name, 'abcdef')])
  try {
    const response = await webdav.request('PROPFIND', '/', {
      headers: { depth: '1' },
    })
    assert.equal(response.status, 207)

    const href = response.text.match(/<D:href>([^<]*)<\/D:href>/g)?.[1] ?? ''
    assert.match(href, /%E4%B8%AD%E6%96%87/)
    assert.match(href, /%26/)
    assert.match(href, /%23/)
    assert.deepEqual(hrefs(response.text), ['/', `/${name}`])

    for (const element of [
      'displayname',
      'resourcetype',
      'getcontentlength',
      'getlastmodified',
      'getcontenttype',
      'getetag',
    ]) {
      assert.ok(count(response.text, element) >= 1, element)
    }
    assert.match(response.text, /<D:getcontentlength>6<\/D:getcontentlength>/)
    assert.match(response.text, /<D:getcontenttype>video\/mp4<\/D:getcontenttype>/)
    assert.match(response.text, /<D:getetag>"[^"]+"/)

    const encoded = '/%E4%B8%AD%E6%96%87%20%E5%90%8D%E7%A7%B0%20%26%20%231.mp4'
    const fetched = await webdav.request('GET', encoded)
    assert.equal(fetched.status, 200)
    assert.equal(fetched.text, 'abcdef')
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('PROPFIND ignores the request body and unknown file names are 404', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4')])
  try {
    const response = await webdav.request('PROPFIND', '/', {
      headers: { depth: '0' },
      body:
        '<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:prop><D:getetag/></D:prop></D:propfind>',
    })
    assert.equal(response.status, 207)
    assert.deepEqual(hrefs(response.text), ['/'])

    const missing = await webdav.request('GET', '/absent.mp4')
    assert.equal(missing.status, 404)
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('write methods are forbidden and unknown methods are not allowed', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4')])
  try {
    for (const method of [
      'PUT',
      'DELETE',
      'MKCOL',
      'MOVE',
      'COPY',
      'PROPPATCH',
      'LOCK',
      'UNLOCK',
    ]) {
      const response = await webdav.request(method, '/clip.mp4')
      assert.equal(response.status, 403, method)
      assert.equal(response.body.length, 0, method)
    }

    const unknown = await webdav.request('PATCH', '/clip.mp4')
    assert.equal(unknown.status, 405)
    assert.match(unknown.headers.get('allow') ?? '', /PROPFIND/)
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('path traversal and nested paths are 404 even when the target name exists', async () => {
  const directory = makeTempDir()
  const webdav = await openWebdav([writeVideo(directory, 'clip.mp4')])
  try {
    for (const path of [
      '/../clip.mp4',
      '/%2e%2e/clip.mp4',
      '/sub%2Fclip.mp4',
      '/sub/clip.mp4',
      '/clip%5C.mp4',
      '/clip.mp4/',
      '//clip.mp4',
    ]) {
      const response = await webdav.rawRequest('GET', path)
      assert.equal(response.status, 404, path)
    }
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})
