import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ServicesProvider } from './services'
import {
  classifyNativeResult,
  isUnsupported,
  useDesktopAvailable,
  useWindowTitle,
} from './native'
import { makeFakeApi } from '../test/fakes'

function DesktopProbe() {
  const available = useDesktopAvailable()
  return <span data-testid="desktop">{String(available)}</span>
}

function TitleHost() {
  useWindowTitle('Enjoy')
  return <span>body</span>
}

describe('原生能力结果', () => {
  it('把 unsupported 标成正常降级，其余失败保留错误码', () => {
    expect(
      classifyNativeResult({ ok: false, code: 'unsupported', message: '无外壳' }),
    ).toEqual({
      ok: false,
      code: 'unsupported',
      message: '无外壳',
      unsupported: true,
    })

    expect(
      classifyNativeResult({ ok: false, code: 'denied', message: '拒绝' }),
    ).toEqual({
      ok: false,
      code: 'denied',
      message: '拒绝',
      unsupported: false,
    })

    expect(classifyNativeResult({ ok: true, value: { ready: true } })).toEqual({
      ok: true,
      value: { ready: true },
    })
  })

  it('isUnsupported 只把 unsupported 当作降级', () => {
    expect(isUnsupported({ code: 'unsupported' })).toBe(true)
    expect(isUnsupported({ code: 'denied' })).toBe(false)
    expect(isUnsupported(null)).toBe(false)
  })
})

describe('窗口能力探测', () => {
  it('window.state 返回 unsupported 时判定为浏览器模式', async () => {
    const api = makeFakeApi({
      nativeFailures: {
        'window.state': { code: 'unsupported', message: '当前没有可用的原生外壳' },
      },
    })
    render(
      <ServicesProvider value={{ api, scanEvents: makeFakeScanEvents() }}>
        <DesktopProbe />
      </ServicesProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('desktop')).toHaveTextContent('false'),
    )
  })

  it('window.state 成功时判定为桌面模式', async () => {
    const api = makeFakeApi()
    render(
      <ServicesProvider value={{ api, scanEvents: makeFakeScanEvents() }}>
        <DesktopProbe />
      </ServicesProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('desktop')).toHaveTextContent('true'),
    )
  })
})

describe('窗口命令降级', () => {
  it('窗口标题不受支持时静默跳过', async () => {
    const api = makeFakeApi({
      nativeFailures: {
        'window.setTitle': { code: 'unsupported', message: '无外壳' },
      },
    })
    render(
      <ServicesProvider value={{ api, scanEvents: makeFakeScanEvents() }}>
        <TitleHost />
      </ServicesProvider>,
    )

    await waitFor(() =>
      expect(api.nativeCalls.map((call) => call.command)).toContain(
        'window.setTitle',
      ),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

function makeFakeScanEvents() {
  return {
    subscribe() {
      return () => {}
    },
  }
}
