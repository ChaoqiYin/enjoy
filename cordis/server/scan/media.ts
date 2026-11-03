/**
 * External media tools: one ffprobe read and one ffmpeg frame grab.
 *
 * Both are ordinary child processes with a timeout, because a broken file can
 * make either of them hang. The caller decides what a failure means; here it is
 * only an error.
 */

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Cache filenames carry this number so a future encoding change can invalidate them. */
export const THUMBNAIL_REVISION = 1

const PROBE_TIMEOUT_MS = 30_000
const THUMBNAIL_TIMEOUT_MS = 60_000
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

export interface MediaTools {
  ffmpeg: string
  ffprobe: string
}

export interface MediaMetadata {
  durationMs: number | null
  width: number | null
  height: number | null
  codec: string | null
}

/**
 * Locate the two programs.
 *
 * An explicit environment variable wins. Development builds fall back to `PATH`,
 * which is how the integration tests find the host's tools. A packaged build
 * should prefer its bundled resource directory before `PATH`; that directory
 * does not exist yet, so it is left for the packaging task.
 */
export function resolveMediaTools(environment: NodeJS.ProcessEnv = process.env): MediaTools {
  // TODO(#114): packaged builds resolve ffmpeg/ffprobe from the bundled resources first.
  return {
    ffmpeg: environment.ENJOY_FFMPEG || 'ffmpeg',
    ffprobe: environment.ENJOY_FFPROBE || 'ffprobe',
  }
}

/** Whether both programs can be started at all; checked once per media phase run. */
export async function toolsAvailable(tools: MediaTools, timeoutMs = 5_000): Promise<boolean> {
  try {
    await Promise.all([
      execFileAsync(tools.ffprobe, ['-version'], { timeout: timeoutMs }),
      execFileAsync(tools.ffmpeg, ['-version'], { timeout: timeoutMs }),
    ])
    return true
  } catch {
    return false
  }
}

/** Read the first video stream's dimensions, codec and duration. */
export async function probeMedia(
  source: string,
  tools: MediaTools,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<MediaMetadata> {
  const { stdout } = await execFileAsync(
    tools.ffprobe,
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      source,
    ],
    { timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES },
  )

  let parsed: ProbeOutput
  try {
    parsed = JSON.parse(stdout) as ProbeOutput
  } catch {
    throw new Error(`ffprobe returned unreadable output for ${source}`)
  }

  const stream = parsed.streams?.find((entry) => entry.codec_type === 'video')
  if (!stream) throw new Error(`no video stream in ${source}`)

  const seconds = positiveNumber(parsed.format?.duration) ?? positiveNumber(stream.duration)
  return {
    durationMs: seconds === undefined ? null : Math.round(seconds * 1000),
    width: positiveInteger(stream.width),
    height: positiveInteger(stream.height),
    codec: typeof stream.codec_name === 'string' ? stream.codec_name : null,
  }
}

/** The cache name for one video's JPEG: id, its mtime and the encoding revision. */
export function thumbnailFileName(
  videoId: number,
  modifiedAt: number,
  revision = THUMBNAIL_REVISION,
): string {
  return `${videoId}-${modifiedAt}-${revision}.jpg`
}

/**
 * Grab one frame as a JPEG.
 *
 * The frame is written under a temporary name in the same directory and moved
 * into place only once ffmpeg has finished, so a killed process can never leave
 * a half-written file that a later scan would treat as a cache hit.
 */
export async function writeThumbnail(
  source: string,
  target: string,
  tools: MediaTools,
  timeoutMs = THUMBNAIL_TIMEOUT_MS,
): Promise<void> {
  mkdirSync(dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp.jpg`
  try {
    await execFileAsync(
      tools.ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-y',
        '-i',
        source,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-vf',
        'scale=480:-2',
        '-q:v',
        '3',
        temporary,
      ],
      { timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES },
    )
    renameSync(temporary, target)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}

interface ProbeOutput {
  streams?: {
    codec_type?: string
    codec_name?: string
    width?: number
    height?: number
    duration?: string
  }[]
  format?: { duration?: string }
}

function positiveNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function positiveInteger(raw: number | undefined): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : null
}
