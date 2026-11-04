import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LibraryPage } from '../../../src/pages/LibraryPage'
import { ServicesProvider } from '../../../src/shared/services'
import {
  makeFakeApi,
  makeFakeScanEvents,
  makeVideos,
  type FakeApi,
} from '../../fakes'

function renderLibrary(api: FakeApi = makeFakeApi()) {
  const scan = makeFakeScanEvents()
  render(
    <ServicesProvider value={{ api, scanEvents: scan.source }}>
      <LibraryPage />
    </ServicesProvider>,
  )
  return { api, scan }
}

function chooseSort(label: string): void {
  fireEvent.click(screen.getByRole('combobox', { name: '排序' }))
  fireEvent.click(screen.getByRole('option', { name: label }))
}

async function firstCardText(): Promise<string> {
  const cards = await screen.findAllByTestId('video-card')
  return cards[0]!.textContent ?? ''
}

describe('视频管理页', () => {
  it('打开时按最新顺序展示第一页的 24 条记录', async () => {
    const { api } = renderLibrary()

    const cards = await screen.findAllByTestId('video-card')

    expect(cards).toHaveLength(24)
    expect(api.calls.at(-1)).toMatchObject({
      only: 'all',
      sort: 'newest',
      offset: 0,
      limit: 24,
    })
    expect(await firstCardText()).toContain('Video 30')
    expect(screen.getByText('本库共 30 个视频')).toBeInTheDocument()
  })

  it('可以在网格、列表与表格之间切换，且不重置排序', async () => {
    const { api } = renderLibrary()
    await screen.findByTestId('video-board')

    chooseSort('文件名')
    await waitFor(() => {
      expect(api.calls.at(-1)).toMatchObject({ sort: 'name' })
    })

    fireEvent.click(screen.getByTestId('view-mode-list'))
    expect(screen.getByTestId('video-board')).toHaveAttribute(
      'data-view-mode',
      'list',
    )
    expect(screen.getAllByTestId('video-row').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByTestId('view-mode-table'))
    expect(screen.getByTestId('video-board')).toHaveAttribute(
      'data-view-mode',
      'table',
    )
    expect(screen.getByTestId('video-table')).toBeInTheDocument()

    expect(screen.getByRole('combobox', { name: '排序' })).toHaveTextContent(
      '文件名',
    )
    expect(api.calls.at(-1)).toMatchObject({ sort: 'name' })
  })

  it('按文件名排序时向后端请求 name 并按文件名排列', async () => {
    const { api } = renderLibrary()
    await screen.findAllByTestId('video-card')

    chooseSort('文件名')

    await waitFor(() => expect(api.calls.at(-1)?.sort).toBe('name'))
    await waitFor(async () =>
      expect(await firstCardText()).toContain('Video 01'),
    )
  })

  it('按最近播放排序时把播放过的记录排在前面', async () => {
    const { api } = renderLibrary()
    await screen.findAllByTestId('video-card')

    chooseSort('最近播放')

    await waitFor(() => expect(api.calls.at(-1)?.sort).toBe('played'))
    await waitFor(async () =>
      expect(await firstCardText()).toContain('Video 02'),
    )
  })

  it('搜索时把关键词交给后端并从第一页重新读取', async () => {
    const { api } = renderLibrary()
    await screen.findAllByTestId('video-card')

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索' }), {
      target: { value: 'Video 02' },
    })

    await waitFor(() =>
      expect(api.calls.at(-1)).toMatchObject({ search: 'Video 02', offset: 0 }),
    )
    const cards = await screen.findAllByTestId('video-card')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveTextContent('Video 02.mp4')
  })

  it('翻页时请求下一页的偏移量', async () => {
    const { api } = renderLibrary()
    await screen.findAllByTestId('video-card')

    fireEvent.click(screen.getByRole('button', { name: '下一页' }))

    await waitFor(() => expect(api.calls.at(-1)?.offset).toBe(24))
    expect(await screen.findAllByTestId('video-card')).toHaveLength(6)
    expect(screen.getByRole('button', { name: '第 2 页' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('点击卡片正文打开详情并读取单条记录', async () => {
    const { api } = renderLibrary()
    const cards = await screen.findAllByTestId('video-card')
    const first = cards[0]!
    const id = Number(first.dataset.videoId)

    fireEvent.click(within(first).getByText('Video 30.mp4'))

    expect(await screen.findByTestId('video-detail-dialog')).toBeInTheDocument()
    expect(api.detailReads).toContain(id)
  })

  it('收藏按钮调用后端并立即反映收藏状态', async () => {
    const { api } = renderLibrary()
    const cards = await screen.findAllByTestId('video-card')
    const first = cards[0]!
    const id = Number(first.dataset.videoId)
    const button = within(first).getByTestId('favorite-video')

    expect(button).toHaveAttribute('aria-pressed', String(api.favorites.get(id)))

    fireEvent.click(button)

    await waitFor(() => expect(api.favorites.get(id)).toBe(true))
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('播放失败时显示可读的提示', async () => {
    const api = makeFakeApi({
      playFailure: {
        code: 'unsupported',
        message: '当前没有可用的原生外壳',
      },
    })
    renderLibrary(api)
    const cards = await screen.findAllByTestId('video-card')

    fireEvent.click(
      within(cards[0]!).getByRole('button', { name: '播放' }),
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('请用桌面应用打开')
    expect(alert).toHaveTextContent('复制路径')
    expect(screen.getByTestId('video-board')).toBeInTheDocument()
  })

  it('播放成功时把这次打开的记录交给后端', async () => {
    const { api } = renderLibrary()
    const cards = await screen.findAllByTestId('video-card')

    fireEvent.click(
      within(cards[0]!).getByRole('button', { name: '播放' }),
    )

    await waitFor(() => expect(api.played).toHaveLength(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('扫描完成事件触发当前列表重新读取', async () => {
    const { api, scan } = renderLibrary()
    await screen.findAllByTestId('video-card')
    const before = api.calls.length

    scan.emit({ scanId: 's1', spaceId: 1, phase: 'done' })

    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before))
  })

  it('扫描失败也触发当前列表重新读取', async () => {
    const { api, scan } = renderLibrary()
    await screen.findAllByTestId('video-card')
    const before = api.calls.length

    scan.emit({ scanId: 's1', spaceId: 1, phase: 'failed' })

    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before))
  })

  it('扫描结束使当前页越界时回到第一页', async () => {
    const { api, scan } = renderLibrary(
      makeFakeApi({ videos: makeVideos(60) }),
    )
    await screen.findAllByTestId('video-card')

    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(api.calls.at(-1)?.offset).toBe(48))

    // Thirty records leave two pages, so page three is gone; the reader goes
    // back to the first page rather than to the last one.
    api.setVideos(makeVideos(30))
    scan.emit({ scanId: 's1', spaceId: 1, phase: 'done' })

    await waitFor(() => expect(api.calls.at(-1)?.offset).toBe(0))
    expect(await screen.findAllByTestId('video-card')).toHaveLength(24)
  })

  it('浏览器模式下隐藏「在文件夹中显示」', async () => {
    const api = makeFakeApi({
      nativeFailures: {
        'window.state': { code: 'unsupported', message: '当前没有可用的原生外壳' },
      },
    })
    renderLibrary(api)
    await screen.findAllByTestId('video-card')

    await waitFor(() =>
      expect(api.nativeCalls.map((call) => call.command)).toContain(
        'window.state',
      ),
    )
    expect(screen.queryByTestId('reveal-video')).toBeNull()
    expect(screen.queryByText('打开所在目录')).toBeNull()
  })

  it('有外壳时可以直接定位文件', async () => {
    const { api } = renderLibrary()
    const cards = await screen.findAllByTestId('video-card')
    const first = cards[0]!

    await waitFor(() =>
      expect(api.nativeCalls.map((call) => call.command)).toContain(
        'window.state',
      ),
    )

    const reveal = await within(first).findByTestId('reveal-video')
    fireEvent.click(reveal)

    await waitFor(() =>
      expect(api.nativeCalls.at(-1)).toEqual({
        command: 'shell.showItemInFolder',
        input: { path: expect.stringMatching(/\.mp4$/) },
      }),
    )
  })
})
