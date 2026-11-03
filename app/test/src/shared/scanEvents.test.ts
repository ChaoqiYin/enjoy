import { afterEach, describe, expect, it, vi } from 'vitest'
import { createScanEventSource, type ScanEvent } from '../../../src/shared/scanEvents'

class FakeSocket {
  static instances: FakeSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((message: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }

  open() {
    this.onopen?.()
  }

  deliver(event: ScanEvent) {
    this.onmessage?.({ data: JSON.stringify({ type: 'scan', data: event }) })
  }

  close() {
    this.onclose?.()
  }
}

afterEach(() => {
  FakeSocket.instances = []
  vi.useRealTimers()
})

describe('扫描事件源', () => {
  it('断线重连后先通知订阅者取状态，再继续投递进度', () => {
    vi.useFakeTimers()
    const source = createScanEventSource({
      token: 'token',
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
      reconnectDelayMs: 10,
    })
    const events: ScanEvent[] = []
    const connects: boolean[] = []
    const stop = source.subscribe((event) => events.push(event), {
      onConnect: (reconnected) => connects.push(reconnected),
    })

    const first = FakeSocket.instances[0]!
    first.open()
    expect(connects).toEqual([false])

    first.close()
    vi.advanceTimersByTime(10)

    const second = FakeSocket.instances[1]!
    second.open()
    expect(connects).toEqual([false, true])

    second.deliver({ scanId: 's1', spaceId: 1, phase: 'indexing' })
    expect(events).toHaveLength(1)

    stop()
  })
})
