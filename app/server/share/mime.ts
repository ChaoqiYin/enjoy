/**
 * Content types for the media files a share is likely to contain.
 *
 * WebDAV clients lean on `getcontenttype` and `Content-Type` to decide whether
 * they can play a file, so common video containers are mapped explicitly;
 * anything else is served as `application/octet-stream`.
 */

import { extname } from 'node:path'

const TYPES = new Map<string, string>([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/x-m4v'],
  ['.mov', 'video/quicktime'],
  ['.mkv', 'video/x-matroska'],
  ['.webm', 'video/webm'],
  ['.avi', 'video/x-msvideo'],
  ['.wmv', 'video/x-ms-wmv'],
  ['.flv', 'video/x-flv'],
  ['.mpg', 'video/mpeg'],
  ['.mpeg', 'video/mpeg'],
  ['.ts', 'video/mp2t'],
  ['.m2ts', 'video/mp2t'],
  ['.ogv', 'video/ogg'],
  ['.3gp', 'video/3gpp'],
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.flac', 'audio/flac'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
  ['.opus', 'audio/ogg'],
  ['.aac', 'audio/aac'],
])

export const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

export function contentTypeFor(name: string): string {
  return TYPES.get(extname(name).toLowerCase()) ?? DEFAULT_CONTENT_TYPE
}
