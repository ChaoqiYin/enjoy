import assert from 'node:assert/strict'
import test from 'node:test'
import { openLibrary, seedVideos, type LibraryFixture } from './test-harness.ts'

interface VideoBody {
  id: number
  path: string
  fileName: string
  folderPath: string
  fileSize: number
  modifiedAt: number
  durationMs: number | null
  width: number | null
  height: number | null
  codec: string | null
  thumbnailPath: string | null
  favorite: boolean
  playCount: number
  lastPlayedAt: number | null
  createdAt: number
  updatedAt: number
}

function videosOf(body: unknown): VideoBody[] {
  return (body as { videos: VideoBody[] }).videos
}

function idsOf(body: unknown): number[] {
  return videosOf(body).map((video) => video.id)
}

function totalOf(body: unknown): number {
  return (body as { total: number }).total
}

function codeOf(body: unknown): string {
  return (body as { code: string }).code
}

/** Seed into the fixture's current space unless the row names another one. */
function seed(library: LibraryFixture, rows: Parameters<typeof seedVideos>[1]): number[] {
  return seedVideos(library.dataDir, rows)
}

test('GET /api/videos lists the current space newest first and reports the total', async () => {
  const library = await openLibrary()
  try {
    seed(library, [
      { spaceId: 1, path: '/media/old.mkv', fileName: 'old.mkv', createdAt: 10 },
      { spaceId: 1, path: '/media/new.mkv', fileName: 'new.mkv', createdAt: 20 },
    ])

    const response = await library.harness.request('GET', '/api/videos')
    assert.equal(response.status, 200)
    assert.equal(totalOf(response.body), 2)
    assert.deepEqual(idsOf(response.body), [2, 1])
    assert.deepEqual(videosOf(response.body)[0], {
      id: 2,
      path: '/media/new.mkv',
      fileName: 'new.mkv',
      folderPath: '',
      fileSize: 0,
      modifiedAt: 0,
      durationMs: null,
      width: null,
      height: null,
      codec: null,
      thumbnailPath: null,
      favorite: false,
      playCount: 0,
      lastPlayedAt: null,
      createdAt: 20,
      updatedAt: 20,
    })
  } finally {
    await library.close()
  }
})

test('GET /api/videos pages with a default of 24 and an empty page past the end', async () => {
  const library = await openLibrary()
  try {
    seed(
      library,
      Array.from({ length: 30 }, (_, index) => ({
        spaceId: 1,
        path: `/media/v${index}.mkv`,
        fileName: `v${index}.mkv`,
        createdAt: index,
      })),
    )

    const first = await library.harness.request('GET', '/api/videos')
    assert.equal(videosOf(first.body).length, 24)
    assert.equal(totalOf(first.body), 30)
    assert.deepEqual(idsOf(first.body), Array.from({ length: 24 }, (_, index) => 30 - index))

    const second = await library.harness.request('GET', '/api/videos?offset=24&limit=24')
    assert.deepEqual(idsOf(second.body), [6, 5, 4, 3, 2, 1])
    assert.equal(totalOf(second.body), 30)

    const past = await library.harness.request('GET', '/api/videos?offset=999')
    assert.equal(past.status, 200)
    assert.deepEqual(past.body, { videos: [], total: 30 })
  } finally {
    await library.close()
  }
})

test('GET /api/videos filters by favorites, played history, and all', async () => {
  const library = await openLibrary()
  try {
    seed(library, [
      { spaceId: 1, path: '/media/fav.mkv', fileName: 'fav.mkv', favorite: true },
      {
        spaceId: 1,
        path: '/media/played.mkv',
        fileName: 'played.mkv',
        playCount: 2,
        lastPlayedAt: 5,
      },
      { spaceId: 1, path: '/media/plain.mkv', fileName: 'plain.mkv' },
    ])

    const favorites = await library.harness.request('GET', '/api/videos?only=favorites')
    assert.deepEqual(idsOf(favorites.body), [1])
    assert.equal(favorites.status, 200)

    const played = await library.harness.request('GET', '/api/videos?only=played')
    assert.deepEqual(idsOf(played.body), [2])

    const all = await library.harness.request('GET', '/api/videos?only=all')
    assert.equal(videosOf(all.body).length, 3)

    const unknown = await library.harness.request('GET', '/api/videos?only=shared')
    assert.equal(unknown.status, 400)
    assert.equal(codeOf(unknown.body), 'bad_request')
  } finally {
    await library.close()
  }
})

test('GET /api/videos sorts by newest, played, name and size', async () => {
  const library = await openLibrary()
  try {
    seed(library, [
      {
        spaceId: 1,
        path: '/media/alpha.mkv',
        fileName: 'alpha.mkv',
        fileSize: 100,
        createdAt: 30,
        lastPlayedAt: 30,
      },
      {
        spaceId: 1,
        path: '/media/beta.mkv',
        fileName: 'beta.mkv',
        fileSize: 300,
        createdAt: 10,
        lastPlayedAt: null,
      },
      {
        spaceId: 1,
        path: '/media/gamma.mkv',
        fileName: 'gamma.mkv',
        fileSize: 200,
        createdAt: 20,
        lastPlayedAt: 20,
      },
    ])

    const newest = await library.harness.request('GET', '/api/videos?sort=newest')
    assert.deepEqual(idsOf(newest.body), [1, 3, 2])

    const played = await library.harness.request('GET', '/api/videos?sort=played')
    assert.deepEqual(idsOf(played.body), [1, 3, 2])

    const name = await library.harness.request('GET', '/api/videos?sort=name')
    assert.deepEqual(idsOf(name.body), [1, 2, 3])

    const size = await library.harness.request('GET', '/api/videos?sort=size')
    assert.deepEqual(idsOf(size.body), [2, 3, 1])

    const unknown = await library.harness.request('GET', '/api/videos?sort=added')
    assert.equal(unknown.status, 400)
    assert.equal(codeOf(unknown.body), 'bad_request')
  } finally {
    await library.close()
  }
})

test('PUT /api/videos/:id/favorite turns the mark on and off', async () => {
  const library = await openLibrary()
  try {
    seed(library, [{ spaceId: 1, path: '/media/a.mkv', fileName: 'a.mkv' }])

    const marked = await library.harness.request('PUT', '/api/videos/1/favorite', { favorite: true })
    assert.equal(marked.status, 200)
    assert.equal((marked.body as { video: VideoBody }).video.favorite, true)

    const favorites = await library.harness.request('GET', '/api/videos?only=favorites')
    assert.deepEqual(idsOf(favorites.body), [1])

    const unmarked = await library.harness.request('PUT', '/api/videos/1/favorite', {
      favorite: false,
    })
    assert.equal((unmarked.body as { video: VideoBody }).video.favorite, false)

    const empty = await library.harness.request('GET', '/api/videos?only=favorites')
    assert.deepEqual(idsOf(empty.body), [])

    const badBody = await library.harness.request('PUT', '/api/videos/1/favorite', {
      favorite: 'yes',
    })
    assert.equal(badBody.status, 400)
    assert.equal(codeOf(badBody.body), 'bad_request')

    const missing = await library.harness.request('PUT', '/api/videos/99/favorite', {
      favorite: true,
    })
    assert.equal(missing.status, 404)
    assert.equal(codeOf(missing.body), 'video.not_found')
  } finally {
    await library.close()
  }
})

test('PUT /api/videos/:id/played counts the play and stamps the latest time', async () => {
  const library = await openLibrary()
  try {
    seed(library, [{ spaceId: 1, path: '/media/a.mkv', fileName: 'a.mkv' }])

    const first = await library.harness.request('PUT', '/api/videos/1/played')
    assert.equal(first.status, 200)
    const afterFirst = (first.body as { video: VideoBody }).video
    assert.equal(afterFirst.playCount, 1)
    assert.equal(typeof afterFirst.lastPlayedAt, 'number')

    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await library.harness.request('PUT', '/api/videos/1/played')
    const afterSecond = (second.body as { video: VideoBody }).video
    assert.equal(afterSecond.playCount, 2)
    assert.ok((afterSecond.lastPlayedAt ?? 0) >= (afterFirst.lastPlayedAt ?? 0))

    const detail = await library.harness.request('GET', '/api/videos/1')
    assert.equal((detail.body as { video: VideoBody }).video.playCount, 2)

    const played = await library.harness.request('GET', '/api/videos?only=played')
    assert.deepEqual(idsOf(played.body), [1])
  } finally {
    await library.close()
  }
})

test('the video list is scoped to one space and falls back to the current one', async () => {
  const library = await openLibrary()
  try {
    seed(library, [{ spaceId: 1, path: '/media/one.mkv', fileName: 'one.mkv' }])
    await library.harness.request('POST', '/api/spaces', { name: 'Movies' })
    seed(library, [{ spaceId: 2, path: '/media/two.mkv', fileName: 'two.mkv' }])

    const first = await library.harness.request('GET', '/api/videos?spaceId=1')
    assert.deepEqual(idsOf(first.body), [1])

    const second = await library.harness.request('GET', '/api/videos?spaceId=2')
    assert.deepEqual(idsOf(second.body), [2])

    const current = await library.harness.request('GET', '/api/videos')
    assert.deepEqual(idsOf(current.body), [2])

    const missing = await library.harness.request('GET', '/api/videos?spaceId=99')
    assert.equal(missing.status, 404)
    assert.equal(codeOf(missing.body), 'space.not_found')
  } finally {
    await library.close()
  }
})

test('GET /api/videos/:id reads one record and rejects unknown or malformed ids', async () => {
  const library = await openLibrary()
  try {
    seed(library, [
      {
        spaceId: 1,
        path: '/media/a.mkv',
        fileName: 'a.mkv',
        fileSize: 42,
        folderPath: '/media',
        durationMs: 9000,
        width: 1920,
        height: 1080,
        codec: 'h264',
        thumbnailPath: '/thumb/a.jpg',
        favorite: true,
        playCount: 3,
        lastPlayedAt: 7,
        createdAt: 5,
        updatedAt: 6,
      },
    ])

    const response = await library.harness.request('GET', '/api/videos/1')
    assert.equal(response.status, 200)
    assert.deepEqual((response.body as { video: VideoBody }).video, {
      id: 1,
      path: '/media/a.mkv',
      fileName: 'a.mkv',
      folderPath: '/media',
      fileSize: 42,
      modifiedAt: 0,
      durationMs: 9000,
      width: 1920,
      height: 1080,
      codec: 'h264',
      thumbnailPath: '/thumb/a.jpg',
      favorite: true,
      playCount: 3,
      lastPlayedAt: 7,
      createdAt: 5,
      updatedAt: 6,
    })

    const missing = await library.harness.request('GET', '/api/videos/99')
    assert.equal(missing.status, 404)
    assert.equal(codeOf(missing.body), 'video.not_found')

    const malformed = await library.harness.request('GET', '/api/videos/abc')
    assert.equal(malformed.status, 400)
    assert.equal(codeOf(malformed.body), 'bad_request')

    const badOffset = await library.harness.request('GET', '/api/videos?offset=nope')
    assert.equal(badOffset.status, 400)
    assert.equal(codeOf(badOffset.body), 'bad_request')

    const badLimit = await library.harness.request('GET', '/api/videos?limit=-1')
    assert.equal(badLimit.status, 400)
    assert.equal(codeOf(badLimit.body), 'bad_request')
  } finally {
    await library.close()
  }
})
