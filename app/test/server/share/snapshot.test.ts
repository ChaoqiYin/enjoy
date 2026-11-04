import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  makeTempDir,
  openWebdav,
  removeTempDir,
  writeVideo,
} from './harness.ts'

function subdirectory(directory: string, name: string): string {
  const path = join(directory, name)
  mkdirSync(path, { recursive: true })
  return path
}

function hrefs(xml: string): string[] {
  return [...xml.matchAll(/<D:href>([^<]*)<\/D:href>/g)].map((match) =>
    decodeURIComponent(match[1]!),
  )
}

async function listingNames(webdav: Awaited<ReturnType<typeof openWebdav>>): Promise<string[]> {
  const response = await webdav.request('PROPFIND', '/', { headers: { depth: '1' } })
  return hrefs(response.text)
    .filter((href) => href !== '/')
    .map((href) => href.slice(1))
}

test('duplicate names get full-width numbers in path order and keep their bytes', async () => {
  const directory = makeTempDir()
  const paths = ['a', 'b', 'c'].map((folder) =>
    writeVideo(subdirectory(directory, folder), 'clip.mp4', `content-${folder}`),
  )
  const webdav = await openWebdav(paths)
  try {
    assert.deepEqual(await listingNames(webdav), [
      'clip.mp4',
      'clip（1）.mp4',
      'clip（2）.mp4',
    ])
    assert.equal((await webdav.request('GET', '/clip.mp4')).text, 'content-a')
    assert.equal((await webdav.request('GET', '/clip（1）.mp4')).text, 'content-b')
    assert.equal((await webdav.request('GET', '/clip（2）.mp4')).text, 'content-c')
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('a real name that looks generated is reserved even when it sorts first', async () => {
  const directory = makeTempDir()
  const paths = [
    writeVideo(subdirectory(directory, 'a'), 'name（1）.mp4', 'reserved'),
    writeVideo(subdirectory(directory, 'b'), 'name.mp4', 'first'),
    writeVideo(subdirectory(directory, 'c'), 'name.mp4', 'second'),
  ]
  const webdav = await openWebdav(paths)
  try {
    assert.deepEqual(await listingNames(webdav), [
      'name（1）.mp4',
      'name.mp4',
      'name（2）.mp4',
    ])
    assert.equal((await webdav.request('GET', '/name（1）.mp4')).text, 'reserved')
    assert.equal((await webdav.request('GET', '/name.mp4')).text, 'first')
    assert.equal((await webdav.request('GET', '/name（2）.mp4')).text, 'second')
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('names without an extension still get a numbered sibling', async () => {
  const directory = makeTempDir()
  const paths = [
    writeVideo(subdirectory(directory, 'a'), 'readme', 'one'),
    writeVideo(subdirectory(directory, 'b'), 'readme', 'two'),
  ]
  const webdav = await openWebdav(paths)
  try {
    assert.deepEqual(await listingNames(webdav), ['readme', 'readme（1）'])
    assert.equal((await webdav.request('GET', '/readme（1）')).text, 'two')
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('missing inputs and directories are counted but never listed', async () => {
  const directory = makeTempDir()
  const present = writeVideo(directory, 'present.mp4', 'bytes')
  const folder = subdirectory(directory, 'folder.mp4')
  const webdav = await openWebdav([present, join(directory, 'gone.mp4'), folder])
  try {
    assert.equal(webdav.server.missingFiles, 2)
    assert.deepEqual(await listingNames(webdav), ['present.mp4'])

    const noFiles = await openWebdav([])
    try {
      assert.equal(noFiles.server.missingFiles, 0)
      const response = await noFiles.request('PROPFIND', '/', {
        headers: { depth: '1' },
      })
      assert.deepEqual(hrefs(response.text), ['/'])
    } finally {
      await noFiles.close()
    }
  } finally {
    await webdav.close()
    removeTempDir(directory)
  }
})

test('adding a file with a later path does not rename the existing ones', async () => {
  const directory = makeTempDir()
  const first = writeVideo(subdirectory(directory, 'a'), 'clip.mp4', 'a')
  const second = writeVideo(subdirectory(directory, 'b'), 'clip.mp4', 'b')
  const third = writeVideo(subdirectory(directory, 'c'), 'clip.mp4', 'c')

  const before = await openWebdav([first, second])
  const after = await openWebdav([first, second, third])
  try {
    assert.deepEqual(await listingNames(before), ['clip.mp4', 'clip（1）.mp4'])
    assert.deepEqual(await listingNames(after), [
      'clip.mp4',
      'clip（1）.mp4',
      'clip（2）.mp4',
    ])
  } finally {
    await before.close()
    await after.close()
    removeTempDir(directory)
  }
})
