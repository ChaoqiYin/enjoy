/**
 * The startup snapshot of a share: a flat list of readable files and the
 * number of entries that could not be opened.
 *
 * The snapshot is built once and never refreshed. Virtual names are assigned in
 * path order; a collision gets a full-width number before the last extension,
 * and every name that exists on disk is reserved so `名称（1）.mp4` cannot be
 * taken by a generated name even when it comes later in path order.
 */

import { statSync } from 'node:fs'
import { basename } from 'node:path'

export interface SnapshotFile {
  /** Absolute path on disk. */
  path: string
  /** Virtual name under the share root. */
  name: string
  size: number
  /** Epoch milliseconds from `stat`. */
  modifiedAt: number
}

export interface WebdavSnapshot {
  /** Readable files, in the same order their virtual names were assigned. */
  files: SnapshotFile[]
  /** Files looked up by their exact virtual name. */
  byName: Map<string, SnapshotFile>
  /** Inputs that were missing or not a regular file. */
  missingFiles: number
}

interface Candidate {
  path: string
  baseName: string
  size: number
  modifiedAt: number
}

/** Split `clip.2024.mp4` into `clip.2024` and `.mp4`. */
function splitExtension(name: string): [stem: string, extension: string] {
  const index = name.lastIndexOf('.')
  if (index <= 0) return [name, '']
  return [name.slice(0, index), name.slice(index)]
}

function numberedName(name: string, number: number): string {
  const [stem, extension] = splitExtension(name)
  return `${stem}（${number}）${extension}`
}

/** Read one input; anything not a regular file counts as missing. */
function inspect(path: string): Candidate | undefined {
  try {
    const stat = statSync(path)
    if (!stat.isFile()) return undefined
    return {
      path,
      baseName: basename(path),
      size: stat.size,
      modifiedAt: stat.mtimeMs,
    }
  } catch {
    return undefined
  }
}

export function buildSnapshot(paths: readonly string[]): WebdavSnapshot {
  const candidates: Candidate[] = []
  let missingFiles = 0
  for (const path of [...paths].sort()) {
    const candidate = inspect(path)
    if (candidate) candidates.push(candidate)
    else missingFiles += 1
  }

  const reserved = new Set(candidates.map((candidate) => candidate.baseName))
  const claimed = new Set<string>()
  const files: SnapshotFile[] = []
  const byName = new Map<string, SnapshotFile>()

  for (const candidate of candidates) {
    let name = candidate.baseName
    if (claimed.has(name)) {
      for (let number = 1; ; number += 1) {
        const numbered = numberedName(candidate.baseName, number)
        if (claimed.has(numbered) || reserved.has(numbered)) continue
        name = numbered
        break
      }
    }
    claimed.add(name)
    const file: SnapshotFile = {
      path: candidate.path,
      name,
      size: candidate.size,
      modifiedAt: candidate.modifiedAt,
    }
    files.push(file)
    byName.set(name, file)
  }

  return { files, byName, missingFiles }
}
