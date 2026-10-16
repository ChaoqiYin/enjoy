import type { AppError } from './apiTypes';

/**
 * What the interface does with anything a command threw: the kernel's error
 * protocol if that is what it is, and the one code for everything else.
 *
 * It belongs beside the seam rather than at each call site because every
 * caller would otherwise decide for itself what a thrown value is, and the
 * one answer that matters is that a failure the kernel did not describe is
 * still a failure the user is told about — never a `undefined.code` drawn in
 * the corner of the screen.
 */
export function normalizeError(error: unknown): AppError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'errorId' in error &&
    typeof error.errorId === 'string'
  ) {
    const params: Record<string, string> = {};
    if (
      'params' in error &&
      typeof error.params === 'object' &&
      error.params !== null
    ) {
      for (const [key, value] of Object.entries(error.params)) {
        if (typeof value === 'string') params[key] = value;
      }
    }
    return { code: error.code, errorId: error.errorId, params };
  }
  return { code: 'app.unexpected', params: {}, errorId: crypto.randomUUID() };
}
