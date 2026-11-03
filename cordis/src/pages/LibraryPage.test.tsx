import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LibraryPage } from './LibraryPage'
import { ServicesProvider } from '../shared/services'
import {
  makeFakeApi,
  makeFakeScanEvents,
  makeVideos,
  type FakeApi,
} from '../test/fakes'

function renderLibrary(api: FakeApi = makeFakeApi()) {
  const scan = makeFakeScanEvents()
  render(
    <ServicesProvider value={{ api, scanEvents: scan.source }}>
      <LibraryPage />
    </ServicesProvider>,
  )
  return { api, scan }
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

  it('可以在网格、列表与表格之间切换，且不重置排序和筛选', async () => {
    const { api } = renderLibrary()
    await screen.findByTestId('video-board')

    fireEvent.change(screen.getByLabelText('排序'), {
      target: { value: 'name' },
    })
    fireEvent.click(screen.getByTestId('filter-favorites'))
    await waitFor(() => {
      expect(api.calls.at(-1)).toMatchObject({
        only: 'favorites',
        sort: 'name',
      })
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

    expect(screen.getByLabelText('排序')).toHaveValue('name')
    expect(screen.getByTestId('filter-favorites')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(api.calls.at(-1)).toMatchObject({ only: 'favorites', sort: 'name' })
  })

  it('按名称排序时向后端请求 name 并按名称排列', async () => {
    const { api } = renderLibrary()
    await screen.findAllByTestId('video-card')

    fireEvent.change(screen.getByLabelText('排序'), {
      target: { value: 'name' },
    })

    await waitFor(() => expect(api.calls.at(-1)?.sort).toBe('name'))
    await waitFor(async () =>
      expect(await firstCardText()).toContain('Video 01'),
    )
  })

  it('按最近播放排序时把播放过的记录排在前面', async () => {
    const { api } = renderLibrary()
    await screen.findAllByTestId('video-card')

    fireEvent.change(screen.getByLabelText('排序'), {
      target: { value: 'played' },
    })

    await waitFor(() => expect(api.calls.at(-1)?.sort).toBe('played'))
    await waitFor(async () =>
      expect(await firstCardText()).toContain('Video 02'),
    )
  })

  it('筛选收藏时只请求收藏记录并换用收藏的空态', async () => {
    const { api } = renderLibrary()
    await screen.findAllByTestId('video-card')

    fireEvent.click(screen.getByTestId('filter-favorites'))

    await waitFor(() => expect(api.calls.at(-1)?.only).toBe('favorites'))
    const cards = await screen.findAllByTestId('video-card')
    expect(cards.every((card) => card.dataset.favorite === 'true')).toBe(true)
    expect(cards).toHaveLength(15)

    fireEvent.click(screen.getByTestId('filter-played'))
    await waitFor(() => expect(api.calls.at(-1)?.only).toBe('played'))
    expect(await screen.findAllByTestId('video-card')).toHaveLength(1)
  })

  it('翻页时请求下一页的偏移量', async () => {
    const { api } = renderLibrary()
    await screen.findAllByTestId('video-card')

    fireEvent.click(screen.getByTestId('next-page'))

    await waitFor(() => expect(api.calls.at(-1)?.offset).toBe(24))
    expect(await screen.findAllByTestId('video-card')).toHaveLength(6)
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('2 / 2')
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

    fireEvent.click(within(cards[0]!).getByTestId('play-video'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('请用桌面应用打开')
    expect(alert).toHaveTextContent('复制路径')
    expect(screen.getByTestId('video-board')).toBeInTheDocument()
  })

  it('播放成功时把这次打开的记录交给后端', async () => {
    const { api } = renderLibrary()
    const cards = await screen.findAllByTestId('video-card')

    fireEvent.click(within(cards[0]!).getByTestId('play-video'))

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
})
