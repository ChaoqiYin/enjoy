import assert from 'node:assert/strict'
import test from 'node:test'
import { retryBusy } from './db.ts'

function busyError(): Error {
  const error = new Error('database is locked') as Error & { code: string }
  error.code = 'ERR_SQLITE_ERROR'
  return error
}

test('retryBusy replays a write that hit a busy database', () => {
  let calls = 0
  const result = retryBusy(
    () => {
      calls += 1
      if (calls < 3) throw busyError()
      return 'written'
    },
    3,
    1,
  )

  assert.equal(result, 'written')
  assert.equal(calls, 3)
})

test('retryBusy leaves non-busy failures alone', () => {
  let calls = 0
  assert.throws(
    () =>
      retryBusy(
        () => {
          calls += 1
          throw new Error('constraint failed')
        },
        3,
        1,
      ),
    /constraint failed/,
  )
  assert.equal(calls, 1)
})

test('retryBusy gives up after the requested attempts', () => {
  let calls = 0
  assert.throws(
    () =>
      retryBusy(
        () => {
          calls += 1
          throw busyError()
        },
        2,
        1,
      ),
    /database is locked/,
  )
  assert.equal(calls, 2)
})
