/**
 * Media integration: a real scan thread, real ffprobe/ffmpeg and real HTTP.
 *
 * The tools are found the same way the worker finds them: the environment
 * variables first, then `PATH`, then the usual system directories. A machine
 * without them skips these cases rather than failing, because the media phases
 * are the only part of the scan that needs an external program.
 */

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import test from 'node:test'
import { seedVideos } from '../library/test-harness.ts'
import { detectMediaTools, resolveMediaTools, toolsAvailable } from '../../../server/scan/media.ts'
import { openScanningLibrary, waitForTerminal } from './test-harness.ts'

interface VideoBody {
  id: number
  path: string
  modifiedAt: number
  durationMs: number | null
  width: number | null
  height: number | null
  codec: string | null
  thumbnailPath: string | null
}

function findTool(name: string, environment: string): string | null {
  const configured = process.env[environment]
  if (configured && existsSync(configured)) return configured
  const probe = spawnSync(name, ['-version'], { stdio: 'ignore' })
  return probe.status === 0 ? name : null
}

const ffmpeg = findTool('ffmpeg', 'ENJOY_FFMPEG')
const ffprobe = findTool('ffprobe', 'ENJOY_FFPROBE')
const missing = !ffmpeg || !ffprobe
const skip = missing ? 'ffmpeg/ffprobe are not available' : false

test('worker 的空 PATH 下仍能解析到系统安装的媒体工具', { skip }, async () => {
  const tools = resolveMediaTools({ PATH: '' })
  assert.ok(isAbsolute(tools.ffmpeg), tools.ffmpeg)
  assert.ok(isAbsolute(tools.ffprobe), tools.ffprobe)
  assert.equal(await toolsAvailable(tools, 5_000), true)
})

test(
  '媒体工具优先取 PATH 中的可执行文件，环境变量可覆盖',
  { skip: process.platform === 'win32' ? 'Windows 的可执行文件解析不在此用例范围' : false },
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'enjoy-media-tools-'))
    try {
      for (const name of ['ffmpeg', 'ffprobe']) {
        const file = join(dir, name)
        writeFileSync(file, '#!/bin/sh\nexit 0\n')
        chmodSync(file, 0o755)
      }
      assert.deepEqual(resolveMediaTools({ PATH: dir }), {
        ffmpeg: join(dir, 'ffmpeg'),
        ffprobe: join(dir, 'ffprobe'),
      })
      assert.deepEqual(resolveMediaTools({ PATH: dir, ENJOY_FFMPEG: '/opt/tools/ffmpeg' }), {
        ffmpeg: '/opt/tools/ffmpeg',
        ffprobe: join(dir, 'ffprobe'),
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)

/** Render one half-second, 320x240 clip that both tools can read back. */
function makeClip(path: string): void {
  execFileSync(ffmpeg!, [
    '-nostdin',
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x240:rate=10:duration=0.5',
    '-c:v',
    'mpeg4',
    '-pix_fmt',
    'yuv420p',
    path,
  ])
}

async function videoById(library: Awaited<ReturnType<typeof openScanningLibrary>>, id: number) {
  const response = await library.harness.request('GET', `/api/videos/${id}`)
  assert.equal(response.status, 200)
  return (response.body as { video: VideoBody }).video
}

test('扫描写入元数据并生成可访问的 JPEG 缩略图', { skip }, async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    mkdirSync(root, { recursive: true })
    const clip = join(root, 'clip.mp4')
    makeClip(clip)
    await library.harness.request('POST', '/api/directories', { path: root })

    const started = await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    assert.equal(started.status, 202)
    const final = await waitForTerminal(library)

    assert.equal(final.phase, 'done')
    assert.equal(final.failures, 0)
    assert.equal(final.metadataReady, 1)
    assert.equal(final.thumbnailsReady, 1)

    const listed = await library.harness.request('GET', '/api/videos?spaceId=1')
    const video = (listed.body as { videos: VideoBody[] }).videos[0]!
    assert.equal(video.width, 320)
    assert.equal(video.height, 240)
    assert.equal(video.codec, 'mpeg4')
    assert.ok(video.durationMs !== null && Math.abs(video.durationMs - 500) <= 150)
    assert.ok(video.thumbnailPath !== null)
    assert.ok(video.thumbnailPath.startsWith(join(library.dataDir, 'thumbnails')))
    assert.equal(
      basename(video.thumbnailPath),
      `${video.id}-${video.modifiedAt}-1.jpg`,
    )
    assert.ok(existsSync(video.thumbnailPath))

    const thumbnail = await library.harness.raw('GET', `/api/thumbnails/${video.id}`)
    assert.equal(thumbnail.status, 200)
    assert.match(thumbnail.contentType ?? '', /^image\/jpeg/)
    assert.deepEqual([...thumbnail.bytes.subarray(0, 3)], [0xff, 0xd8, 0xff])
  } finally {
    await library.close()
  }
})

test('损坏文件只增加失败计数，扫描照常完成', { skip }, async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'broken.mp4'), 'this is not a video')
    await library.harness.request('POST', '/api/directories', { path: root })

    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const final = await waitForTerminal(library)

    assert.equal(final.phase, 'done')
    assert.deepEqual(final.changes, { added: 1, updated: 0, removed: 0 })
    assert.ok((final.failures ?? 0) >= 1)
    assert.equal(final.metadataReady, 0)
    assert.equal(final.thumbnailsReady, 0)

    const listed = await library.harness.request('GET', '/api/videos?spaceId=1')
    const video = (listed.body as { videos: VideoBody[] }).videos[0]!
    assert.equal(video.durationMs, null)
    assert.equal(video.thumbnailPath, null)

    const thumbnail = await library.harness.raw('GET', `/api/thumbnails/${video.id}`)
    assert.equal(thumbnail.status, 404)
  } finally {
    await library.close()
  }
})

test('缩略图端点在没有缓存时返回 404', async () => {
  const library = await openScanningLibrary()
  try {
    const [id] = seedVideos(library.dataDir, [
      { spaceId: 1, path: '/media/none.mp4', fileName: 'none.mp4' },
    ])

    const withoutCache = await library.harness.raw('GET', `/api/thumbnails/${id}`)
    assert.equal(withoutCache.status, 404)
    assert.equal((JSON.parse(withoutCache.bytes.toString('utf8')) as { code: string }).code,
      'thumbnail.not_found')

    const unknown = await library.harness.raw('GET', '/api/thumbnails/9999')
    assert.equal(unknown.status, 404)
    assert.equal((JSON.parse(unknown.bytes.toString('utf8')) as { code: string }).code,
      'video.not_found')
  } finally {
    await library.close()
  }
})

test('全部重建重新生成缩略图并占用扫描槽', { skip }, async () => {
  const library = await openScanningLibrary()
  try {
    const root = join(library.dataDir, 'media')
    mkdirSync(root, { recursive: true })
    const clip = join(root, 'clip.mp4')
    makeClip(clip)
    // Enough copies that the rebuild is still running when the slot is probed.
    for (let index = 1; index < 30; index += 1) {
      copyFileSync(clip, join(root, `clip-${index}.mp4`))
    }
    await library.harness.request('POST', '/api/directories', { path: root })
    await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    const first = await waitForTerminal(library)
    assert.equal(first.phase, 'done')
    assert.equal(first.thumbnailsReady, 30)

    rmSync(join(library.dataDir, 'thumbnails'), { recursive: true, force: true })
    assert.equal(readdirSync(library.dataDir).includes('thumbnails'), false)

    const rebuilt = await library.harness.request('POST', '/api/thumbnails/rebuild', {
      spaceId: 1,
    })
    assert.equal(rebuilt.status, 202)
    const scanId = (rebuilt.body as { scanId: string }).scanId
    assert.equal(typeof scanId, 'string')

    const duplicate = await library.harness.request('POST', '/api/scan', { spaceId: 1 })
    assert.equal(duplicate.status, 409)
    assert.equal((duplicate.body as { code: string }).code, 'scan.already_active')

    const paused = await library.harness.request('POST', `/api/scan/${scanId}/pause`)
    assert.equal(paused.status, 202)
    assert.equal((paused.body as { phase: string }).phase, 'paused')

    const blocked = await library.harness.request('POST', '/api/spaces', { name: 'Blocked' })
    assert.equal(blocked.status, 409)
    assert.equal((blocked.body as { code: string }).code, 'space.blocked.scanning')

    const resumed = await library.harness.request('POST', `/api/scan/${scanId}/resume`)
    assert.equal(resumed.status, 202)
    const final = await waitForTerminal(library)
    assert.equal(final.phase, 'done')
    assert.equal(final.thumbnailsReady, 30)

    const listed = await library.harness.request('GET', '/api/videos?spaceId=1&limit=100')
    for (const video of (listed.body as { videos: VideoBody[] }).videos) {
      assert.ok(video.thumbnailPath !== null)
      assert.ok(existsSync(video.thumbnailPath))
    }
  } finally {
    await library.close()
  }
})

test('媒体工具检测返回可执行路径，缺失时为空', { skip: process.platform === 'win32' ? 'Windows 的可执行文件解析不在此用例范围' : false }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'enjoy-media-detect-'))
  try {
    const file = join(dir, 'ffmpeg')
    writeFileSync(file, '#!/bin/sh\nexit 0\n')
    chmodSync(file, 0o755)

    assert.deepEqual(detectMediaTools({ PATH: dir }, []), {
      ffmpeg: join(dir, 'ffmpeg'),
      ffprobe: null,
    })
    assert.deepEqual(
      detectMediaTools({ PATH: '', ENJOY_FFMPEG: '/opt/tools/ffmpeg' }, []),
      { ffmpeg: '/opt/tools/ffmpeg', ffprobe: null },
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
