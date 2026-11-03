/**
 * External media tools: one ffprobe read and one ffmpeg frame grab.
 *
 * Both are ordinary child processes with a timeout, because a broken file can
 * make either of them hang. The caller decides what a failure means; here it is
 * only an error.
 */

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { accessSync, constants, mkdirSync, renameSync, rmSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Cache filenames carry this number so a future encoding change can invalidate them. */
export const THUMBNAIL_REVISION = 1

const PROBE_TIMEOUT_MS = 30_000
const THUMBNAIL_TIMEOUT_MS = 60_000
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

/**
 * Places to look when a tool is not on `PATH`.
 *
 * The app runs inside the cordis-app worker, whose environment is deliberately
 * reduced to an empty `PATH`. Without this list a Homebrew or system install
 * would never be found and every video would fail both media phases.
 */
const COMMON_TOOL_DIRS =
  process.platform === 'win32'
    ? []
    : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']

export interface MediaTools {
  ffmpeg: string
  ffprobe: string
}

/** What detection found; `null` means the tool is not available. */
export interface MediaToolDetection {
  ffmpeg: string | null
  ffprobe: string | null
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
 * An explicit environment variable wins. Otherwise the tool is looked up on
 * `PATH` and then in the usual system directories, returning an absolute path
 * so a child process with an empty `PATH` can still start it. Development
 * builds rely on this because the worker environment has no `PATH` at all.
 * A packaged build should prefer its bundled resource directory before these;
 * that directory does not exist yet, so it is left for the packaging task.
 */
export function resolveMediaTools(environment: NodeJS.ProcessEnv = process.env): MediaTools {
  // TODO(#114): packaged builds resolve ffmpeg/ffprobe from the bundled resources first.
  const found = detectMediaTools(environment)
  return {
    ffmpeg: found.ffmpeg ?? 'ffmpeg',
    ffprobe: found.ffprobe ?? 'ffprobe',
  }
}

/**
 * Report where the two tools are, without inventing a fallback name.
 *
 * This is the settings page's answer: a path means it is there, `null` means
 * the media phases will skip (the scan still indexes file names and sizes).
 * `searchDirs` exists so a test can remove the host's installs from the search.
 */
export function detectMediaTools(
  environment: NodeJS.ProcessEnv = process.env,
  searchDirs: readonly string[] = COMMON_TOOL_DIRS,
): MediaToolDetection {
  return {
    ffmpeg: findTool(environment.ENJOY_FFMPEG, 'ffmpeg', environment, searchDirs),
    ffprobe: findTool(environment.ENJOY_FFPROBE, 'ffprobe', environment, searchDirs),
  }
}

function findTool(
  configured: string | undefined,
  name: string,
  environment: NodeJS.ProcessEnv,
  searchDirs: readonly string[],
): string | null {
  if (configured) return configured
  const dirs = [...(environment.PATH ?? '').split(delimiter), ...searchDirs]
  for (const dir of dirs) {
    if (!dir) continue
    const candidate = join(dir, name)
    if (isExecutable(candidate)) return candidate
  }
  return null
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
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
