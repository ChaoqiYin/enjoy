import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareProvider } from '../../../src/features/share/ShareProvider'
import { SharePage } from '../../../src/pages/SharePage'
import { ServicesProvider } from '../../../src/shared/services'
import { ToastProvider } from '../../../src/shared/toast'
import {
  makeFakeApi,
  makeFakeScanEvents,
  makeVideo,
  type FakeApi,
} from '../../fakes'

/** A full first page of shared records, so paging has a second page. */
function sharedVideos(count = 30) {
  return Array.from({ length: count }, (_, index) =>
    makeVideo(index, { shared: true }),
  )
}

function renderShare(api: FakeApi = makeFakeApi()) {
  const scan = makeFakeScanEvents()
  render(
    <ServicesProvider value={{ api, scanEvents: scan.source }}>
      <ToastProvider>
        <ShareProvider>
          <SharePage />
        </ShareProvider>
      </ToastProvider>
    </ServicesProvider>,
  )
  return { api, scan }
}

/** Let the mount reads and their effects settle without moving the clock. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
  }
}

const writeText = vi.fn()

beforeEach(() => {
  writeText.mockReset()
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe('分享页', () => {
  it('共享清单为空时禁用启动，并给出跳转视频库的空态', async () => {
    window.history.replaceState(null, '', '/share')
    renderShare(makeFakeApi({ videos: sharedVideos(3).map((video) => ({ ...video, shared: false })) }))

    expect(
      await screen.findByText('共享清单是空的，先到视频库把视频加入共享清单'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开启共享' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '去视频库挑选' }))
    expect(window.location.pathname).toBe('/')
  })

  it('共享清单为空但带搜索条件时仍禁用启动', async () => {
    renderShare(
      makeFakeApi({
        videos: sharedVideos(3).map((video) => ({ ...video, shared: false })),
      }),
    )
    await screen.findByText('共享清单是空的，先到视频库把视频加入共享清单')

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索' }), {
      target: { value: '没有这个视频' },
    })

    // Wait for the filtered empty state, not the loading window: the button is
    // disabled while a request is in flight either way, and that would hide the
    // case this test is about.
    expect(await screen.findByText('没有匹配的视频')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开启共享' })).toBeDisabled()
  })

  it('清单请求失败时禁用启动', async () => {
    renderShare(
      makeFakeApi({
        videos: sharedVideos(),
        listFailure: { code: 'internal_error', message: '清单读取失败' },
      }),
    )

    expect(await screen.findByText('清单读取失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开启共享' })).toBeDisabled()
  })

  it('启动与停止调用后端，并显示实际端口', async () => {
    const { api } = renderShare(makeFakeApi({ videos: sharedVideos() }))
    await screen.findAllByTestId('video-card')

    fireEvent.click(screen.getByRole('button', { name: '开启共享' }))

    expect(
      await screen.findByText('共享服务正在运行，端口 4918'),
    ).toBeInTheDocument()
    expect(api.share.opened).toBe(1)
    expect(screen.getByRole('button', { name: '结束共享' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '结束共享' }))

    expect(await screen.findByText('共享服务未运行')).toBeInTheDocument()
    expect(api.share.closed).toBe(1)
    expect(screen.getByRole('button', { name: '开启共享' })).toBeInTheDocument()
  })

  it('启动失败时显示原因，并可以重试', async () => {
    const api = makeFakeApi({ videos: sharedVideos() })
    api.share.failNext.open = {
      code: 'share.port_in_use',
      message: 'Every port is in use',
    }
    renderShare(api)
    await screen.findAllByTestId('video-card')

    fireEvent.click(screen.getByRole('button', { name: '开启共享' }))

    expect(
      await screen.findByText('从 4918 起的连续 10 个端口都被占用，共享服务无法启动'),
    ).toBeInTheDocument()
    expect(api.share.opened).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(
      await screen.findByText('共享服务正在运行，端口 4918'),
    ).toBeInTheDocument()
    expect(api.share.opened).toBe(2)
  })

  it('逐个列出连接地址，复制按钮交出完整地址，用户名固定为 enjoy', async () => {
    renderShare(
      makeFakeApi({
        videos: sharedVideos(),
        shareStatus: { running: true, port: 4919 },
      }),
    )
    await screen.findAllByTestId('video-card')

    expect(screen.getByText('http://192.168.1.5:4919/')).toBeInTheDocument()
    expect(screen.getByText('http://127.0.0.1:4919/')).toBeInTheDocument()
    expect(screen.getByText('enjoy')).toBeInTheDocument()
    expect(screen.getByText('本机')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: '复制地址: http://192.168.1.5:4919/',
      }),
    )
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('http://192.168.1.5:4919/'),
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '复制地址: http://127.0.0.1:4919/',
      }),
    )
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('http://127.0.0.1:4919/'),
    )
  })

  it('复制失败时沿用剪贴板失败提示', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    renderShare(
      makeFakeApi({
        videos: sharedVideos(),
        shareStatus: { running: true, port: 4918 },
      }),
    )
    await screen.findAllByTestId('video-card')

    fireEvent.click(
      screen.getByRole('button', {
        name: '复制地址: http://192.168.1.5:4918/',
      }),
    )

    expect(
      await screen.findByText('无法复制到剪贴板'),
    ).toBeInTheDocument()
  })

  it('密码默认遮罩，可显示、复制与重置，重置后提示重启生效', async () => {
    const api = makeFakeApi({
      videos: sharedVideos(),
      shareStatus: { running: true, port: 4918, password: '1234' },
    })
    renderShare(api)
    await screen.findAllByTestId('video-card')

    expect(screen.queryByText('1234')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '显示密码' }))
    expect(screen.getByText('1234')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '复制密码' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('1234'))

    fireEvent.click(screen.getByRole('button', { name: '重新生成密码' }))

    expect(await screen.findByText('5678')).toBeInTheDocument()
    expect(api.share.regenerated).toBe(1)
    expect(
      screen.getByText('重启共享服务后新密码才生效'),
    ).toBeInTheDocument()
  })

  it('列出最近活动的设备，并让相对时间自己往上走', async () => {
    vi.useFakeTimers()
    const now = 1_700_000_000_000
    vi.setSystemTime(now)
    renderShare(
      makeFakeApi({
        videos: sharedVideos(),
        shareStatus: {
          running: true,
          port: 4918,
          devices: [{ name: '电视', address: '192.168.1.31', lastSeenAt: now - 12_000 }],
        },
      }),
    )
    await settle()

    expect(screen.getByText('电视')).toBeInTheDocument()
    expect(screen.getByText('192.168.1.31')).toBeInTheDocument()
    expect(screen.getByText('12 秒前')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByText('13 秒前')).toBeInTheDocument()
  })

  it('没有设备时说明最近一分钟没有连接', async () => {
    renderShare(
      makeFakeApi({
        videos: sharedVideos(),
        shareStatus: { running: true, port: 4918, devices: [] },
      }),
    )

    expect(
      await screen.findByText('最近一分钟内没有设备请求过'),
    ).toBeInTheDocument()
  })

  it('缺失文件与清单变化告警只在运行中显示', async () => {
    const { unmount } = render(
      <ServicesProvider
        value={{
          api: makeFakeApi({
            videos: sharedVideos(),
            shareStatus: {
              running: false,
              missingFiles: 3,
              listChanged: true,
            },
          }),
          scanEvents: makeFakeScanEvents().source,
        }}
      >
        <ToastProvider>
          <ShareProvider>
            <SharePage />
          </ShareProvider>
        </ToastProvider>
      </ServicesProvider>,
    )
    await screen.findAllByTestId('video-card')
    expect(
      screen.queryByText('清单已变化，重启服务后生效'),
    ).toBeNull()
    expect(
      screen.queryByText(
        '共享清单里有 3 个文件已不在磁盘上，电视上不会出现',
      ),
    ).toBeNull()
    unmount()

    renderShare(
      makeFakeApi({
        videos: sharedVideos(),
        shareStatus: {
          running: true,
          port: 4918,
          missingFiles: 2,
          listChanged: true,
        },
      }),
    )
    expect(
      await screen.findByText(
        '共享清单里有 2 个文件已不在磁盘上，电视上不会出现',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('清单已变化，重启服务后生效'),
    ).toBeInTheDocument()
  })

  it('按 only=shared 读取清单，分页、搜索与排序都用同一查询', async () => {
    const { api } = renderShare(makeFakeApi({ videos: sharedVideos() }))
    expect(await screen.findAllByTestId('video-card')).toHaveLength(24)
    expect(api.calls.at(-1)).toMatchObject({
      only: 'shared',
      sort: 'newest',
      offset: 0,
      limit: 24,
    })

    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(api.calls.at(-1)?.offset).toBe(24))

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索' }), {
      target: { value: 'Video 02' },
    })
    await waitFor(() =>
      expect(api.calls.at(-1)).toMatchObject({
        only: 'shared',
        search: 'Video 02',
        offset: 0,
      }),
    )

    fireEvent.click(screen.getByRole('combobox', { name: '排序' }))
    fireEvent.click(screen.getByRole('option', { name: '文件名' }))
    await waitFor(() => expect(api.calls.at(-1)?.sort).toBe('name'))
  })

  it('运行中每五秒刷新状态，失败时保留上一份状态', async () => {
    vi.useFakeTimers()
    const now = 1_700_000_000_000
    vi.setSystemTime(now)
    const api = makeFakeApi({
      videos: sharedVideos(),
      shareStatus: { running: true, port: 4918, devices: [] },
    })
    renderShare(api)
    await settle()
    expect(api.share.statusCalls).toBe(1)

    api.share.setStatus({
      devices: [{ name: '电视', address: '192.168.1.31', lastSeenAt: now }],
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(api.share.statusCalls).toBe(2)
    expect(screen.getByText('电视')).toBeInTheDocument()

    api.share.failNext.status = {
      code: 'internal_error',
      message: 'temporary failure',
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(api.share.statusCalls).toBe(3)
    expect(screen.getByText('电视')).toBeInTheDocument()
    expect(
      screen.getByText('共享服务正在运行，端口 4918'),
    ).toBeInTheDocument()
  })

  it('在分享页移出共享后该记录从清单消失', async () => {
    const { api } = renderShare(makeFakeApi({ videos: sharedVideos() }))
    const cards = await screen.findAllByTestId('video-card')
    const first = cards[0]!
    const id = Number(first.dataset.videoId)

    fireEvent.click(within(first).getByTestId('share-video'))

    await waitFor(() => expect(api.shared.get(id)).toBe(false))
    await waitFor(() =>
      expect(
        screen
          .queryAllByTestId('video-card')
          .some((card) => card.dataset.videoId === String(id)),
      ).toBe(false),
    )
  })
})
