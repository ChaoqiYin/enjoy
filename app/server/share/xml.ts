/**
 * XML responses for `PROPFIND`: the fixed property set and the finite-depth
 * refusal.
 *
 * Only the properties a player needs are emitted. The request body is ignored,
 * so an empty `propfind` and a list of requested properties get the same
 * answer.
 */

import { contentTypeFor } from './mime.ts'
import type { SnapshotFile } from './snapshot.ts'

/** An ETag derived from the snapshot's size and modification time. */
export function etagFor(file: SnapshotFile): string {
  return `"${file.size}-${Math.floor(file.modifiedAt)}"`
}

export function lastModifiedFor(file: SnapshotFile): string {
  return new Date(file.modifiedAt).toUTCString()
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function fileHref(name: string): string {
  return `/${encodeURIComponent(name)}`
}

function fileProps(file: SnapshotFile): string {
  return [
    `<D:displayname>${escapeXml(file.name)}</D:displayname>`,
    '<D:resourcetype/>',
    `<D:getcontentlength>${file.size}</D:getcontentlength>`,
    `<D:getlastmodified>${lastModifiedFor(file)}</D:getlastmodified>`,
    `<D:getcontenttype>${escapeXml(contentTypeFor(file.name))}</D:getcontenttype>`,
    `<D:getetag>${escapeXml(etagFor(file))}</D:getetag>`,
  ].join('')
}

function response(href: string, props: string): string {
  return (
    '<D:response>' +
    `<D:href>${escapeXml(href)}</D:href>` +
    `<D:propstat><D:prop>${props}</D:prop>` +
    '<D:status>HTTP/1.1 200 OK</D:status>' +
    '</D:propstat>' +
    '</D:response>'
  )
}

function document(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">${body}</D:multistatus>`
}

/** The listing for a root PROPFIND: the root, optionally followed by files. */
export function multistatus(files: readonly SnapshotFile[]): string {
  const parts = [
    response(
      '/',
      '<D:displayname>Enjoy</D:displayname><D:resourcetype><D:collection/></D:resourcetype>',
    ),
  ]
  for (const file of files) parts.push(response(fileHref(file.name), fileProps(file)))
  return document(parts.join(''))
}

/** The listing for a file PROPFIND: that file alone, for Depth 0 and 1 alike. */
export function fileMultistatus(file: SnapshotFile): string {
  return document(response(fileHref(file.name), fileProps(file)))
}

/** `Depth: infinity` is allowed to be refused by the protocol. */
export function infiniteDepthError(): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<D:error xmlns:D="DAV:"><D:propfind-finite-depth/></D:error>'
  )
}
