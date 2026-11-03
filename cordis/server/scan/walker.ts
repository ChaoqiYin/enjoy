/**
 * Directory discovery: turn each configured root into a verdict plus the video
 * files it currently holds.
 *
 * The verdict is decided here, once, from the `fs` error kind: only "not
 * found" counts as an absence. Every other failure means this run knows
 * nothing about what the path holds, which is not the same as knowing it holds
 * nothing — those records are kept.
 */

import { readdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { ScanControl } from './control.ts'
import type { DiscoveredFile, RootScan } from './types.ts'

/** The extensions the library recognises, matching the Rust scanner. */
const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mkv',
  'avi',
  'mov',
  'webm',
  'm4v',
  'mpg',
  'mpeg',
  'wmv',
])

export interface DiscoverReport {
  /** Called for every entry so the controller can move `currentPath` along. */
  onEntry(path: string): void
}

export interface DiscoveryResult {
  roots: RootScan[]
  discovered: number
  failures: number
  unreachableDirectories: number
}

/** Read every configured directory in turn. */
export function discover(
  roots: string[],
  control: ScanControl,
  report: DiscoverReport,
): DiscoveryResult {
  const scans: RootScan[] = []
  let discovered = 0
  let failures = 0
  let unreachableDirectories = 0

  for (const root of roots) {
    const scan = readRoot(root, control, report)
    failures += scan.unreadable.length
    if (scan.verdict === 'unreachable') unreachableDirectories += 1
    discovered += scan.files.length
    scans.push(scan)
  }

  return { roots: scans, discovered, failures, unreachableDirectories }
}

/** Classify one configured directory and collect the videos under it. */
export function readRoot(path: string, control: ScanControl, report: DiscoverReport): RootScan {
  control.checkpoint()
  let stats
  try {
    stats = statSync(path)
  } catch (error) {
    if (isNotFound(error)) {
      // A path whose parent is a file is also not a directory any more; the
      // distinction matters for the count, not for the outcome: both keep records.
      return { path, verdict: isNotADirectory(error) ? 'not-a-directory' : 'gone', files: [], unreadable: [] }
    }
    return { path, verdict: 'unreachable', files: [], unreadable: [] }
  }

  if (!stats.isDirectory()) {
    return { path, verdict: 'not-a-directory', files: [], unreadable: [] }
  }

  const files: DiscoveredFile[] = []
  const unreadable: string[] = []

  try {
    walk(path, control, report, files, unreadable)
  } catch (error) {
    if (isNotFound(error)) {
      // The root disappeared between `stat` and `readdir`: its records are stale.
      return { path, verdict: 'gone', files: [], unreadable: [] }
    }
    // A root that cannot be listed says nothing about what is inside it.
    return { path, verdict: 'unreachable', files: [], unreadable: [] }
  }

  return { path, verdict: 'read', files, unreadable }
}

function walk(
  directory: string,
  control: ScanControl,
  report: DiscoverReport,
  files: DiscoveredFile[],
  unreadable: string[],
): void {
  control.checkpoint()
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    // A subtree that vanished mid-walk leaves nothing to keep. Anything else —
    // a permission, a network share that stopped answering — is a fact about
    // this run, so the records under it must not be read as disappeared.
    if (isNotFound(error)) return
    unreadable.push(directory)
    return
  }

  for (const entry of entries) {
    control.checkpoint()
    const path = join(directory, entry.name)
    report.onEntry(path)
    // Symlinks are not followed: the same rule as the Rust scanner keeps a
    // shared folder a second time.
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      walk(path, control, report, files, unreadable)
      continue
    }
    if (!entry.isFile() || !isVideo(path)) continue

    try {
      const stats = statSync(path)
      files.push({
        path,
        fileName: basename(path),
        folderPath: dirname(path),
        fileSize: stats.size,
        modifiedAt: Math.floor(stats.mtimeMs),
      })
    } catch (error) {
      if (isNotFound(error)) continue
      unreadable.push(path)
    }
  }
}

function isVideo(path: string): boolean {
  const extension = extname(path).slice(1).toLowerCase()
  return VIDEO_EXTENSIONS.has(extension)
}

/** Only "not found" is an absence; every other failure is a fact about this run. */
function isNotFound(error: unknown): boolean {
  return errorCode(error) === 'ENOENT'
}

function isNotADirectory(error: unknown): boolean {
  return errorCode(error) === 'ENOTDIR'
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  return (error as { code?: string }).code
}
