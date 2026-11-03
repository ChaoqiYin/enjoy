/**
 * Turn a `{ code, message }` failure into the translation key the interface
 * should read. Codes the page recognises get their own sentence; anything else
 * falls back to the shared retry line rather than showing a server string.
 */

import type { ApiError } from './api'

const KNOWN_CODES = new Set([
  'space.blocked.scanning',
  'space.name.taken',
  'space.name.empty',
  'space.name.too_long',
  'space.remove_last',
  'space.not_found',
  'directory.path.empty',
  'directory.not_found',
  'command_not_allowed',
])

export function errorTranslationKey(error: ApiError): string {
  return KNOWN_CODES.has(error.code) ? error.code : 'errorUnexpected'
}
