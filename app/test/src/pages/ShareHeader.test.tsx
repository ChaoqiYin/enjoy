import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { ShareProvider } from '../../../src/features/share/ShareProvider'
import { AppHeader } from '../../../src/features/layout/AppHeader'
import { ServicesProvider } from '../../../src/shared/services'
import { ToastProvider } from '../../../src/shared/toast'
import { makeFakeApi, makeFakeScanEvents, type FakeApi } from '../../fakes'

function tree(api: FakeApi, revision: number): ReactElement {
  return (
    <ServicesProvider value={{ api, scanEvents: makeFakeScanEvents().source }}>
      <ToastProvider>
        <ShareProvider revision={revision}>
          <AppHeader path="/" onSpaceSwitched={() => {}} />
        </ShareProvider>
      </ToastProvider>
    </ServicesProvider>
  )
}

function renderHeader(api: FakeApi = makeFakeApi(), revision = 0) {
  return render(tree(api, revision))
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
  }
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe('头栏分享状态', () => {
  it('导航项依次为视频库、收藏、分享、设置与插件', () => {
    renderHeader()
    const nav = screen.getByRole('navigation')
    const labels = within(nav)
      .getAllByRole('tab')
      .map((tab) => tab.getAttribute('aria-label'))
    expect(labels).toEqual(['视频库', '收藏', '分享', '设置', '插件'])
  })

  it('服务未运行时显示未在分享', async () => {
    renderHeader()
    expect(await screen.findByRole('status')).toHaveTextContent('未在分享')
  })

  it('服务运行中显示正在分享，点击进入分享页', async () => {
    renderHeader(makeFakeApi({ shareStatus: { running: true, port: 4918 } }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('正在分享')

    fireEvent.click(status)

    await waitFor(() => expect(window.location.pathname).toBe('/share'))
  })

  it('轮询刷新后头栏跟随服务状态变化', async () => {
    vi.useFakeTimers()
    const api = makeFakeApi({ shareStatus: { running: true, port: 4918 } })
    renderHeader(api)
    await settle()
    expect(screen.getByRole('status')).toHaveTextContent('正在分享')
    expect(api.share.statusCalls).toBe(1)

    api.share.setStatus({ running: false, port: null })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(screen.getByRole('status')).toHaveTextContent('未在分享')
  })

  it('切空间重挂时重新读取分享状态', async () => {
    const api = makeFakeApi()
    const view = renderHeader(api, 0)
    await waitFor(() => expect(api.share.statusCalls).toBe(1))

    view.rerender(tree(api, 1))

    await waitFor(() => expect(api.share.statusCalls).toBe(2))
  })
})
