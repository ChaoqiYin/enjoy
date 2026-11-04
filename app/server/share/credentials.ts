/**
 * The one user name and one password every client signs in with.
 *
 * They belong to the application rather than a space: the password is paired
 * with a television once, and a password that changed with the space would have
 * to be typed in again on every switch. The password is four digits because
 * that is what a remote control has keys for; it keeps the uninvited device out
 * of a home network, which is the whole of what it claims to do.
 *
 * The password lives in the application-level `settings` table. Reading it draws
 * and stores one on the first run, so the page that starts the service can show
 * a password before a port is open.
 */

import { randomInt } from 'node:crypto'
import type { LibraryStore } from '../library/store.ts'

/** The user name every client uses; fixed so nobody has to remember it. */
export const SHARE_USERNAME = 'enjoy'

/** The settings key holding the application-wide share password. */
export const PASSWORD_SETTING = 'share.password'

const LENGTH = 4

/** The stored password, drawing and storing one the first time it is asked for. */
export function loadPassword(store: LibraryStore): string {
  const stored = store.getSettings()[PASSWORD_SETTING]
  if (typeof stored === 'string' && /^\d{4}$/.test(stored)) return stored
  return storePassword(store, drawPassword())
}

/** Replace the stored password; the running service keeps the old one. */
export function resetPassword(store: LibraryStore): string {
  return storePassword(store, drawPassword())
}

function storePassword(store: LibraryStore, password: string): string {
  store.putSettings({ [PASSWORD_SETTING]: password })
  return password
}

/** Four digits, each as likely as any other. */
export function drawPassword(): string {
  let password = ''
  for (let index = 0; index < LENGTH; index += 1) password += String(randomInt(0, 10))
  return password
}
