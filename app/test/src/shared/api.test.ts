import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../../../src/shared/api'
import type { HttpTransport } from '../../../src/shared/api'

function makeTransport(put: HttpTransport['put']): HttpTransport {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put,
    delete: vi.fn(),
  }
}

describe('HTTP client', () => {
  it('共享开关提交到对应记录的 shared 路由，并回答服务端存下的状态', async () => {
    const put = vi.fn(async () => ({ shared: true })) as unknown as HttpTransport['put']
    const api = createApiClient(makeTransport(put))

    await expect(api.setShared(7, true)).resolves.toBe(true)
    expect(put).toHaveBeenCalledWith('/api/videos/7/shared', { shared: true })
  })
})
