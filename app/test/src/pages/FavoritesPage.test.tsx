import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FavoritesPage } from '../../../src/pages/FavoritesPage'
import { ServicesProvider } from '../../../src/shared/services'
import { makeFakeApi, makeFakeScanEvents, type FakeApi } from '../../fakes'

function renderFavorites(api: FakeApi = makeFakeApi()) {
  const scan = makeFakeScanEvents()
  render(
    <ServicesProvider value={{ api, scanEvents: scan.source }}>
      <FavoritesPage />
    </ServicesProvider>,
  )
  return { api, scan }
}

describe('收藏页', () => {
  it('只请求当前空间的收藏，并且只画收藏记录', async () => {
    const { api } = renderFavorites()

    const cards = await screen.findAllByTestId('video-card')

    expect(api.calls.at(-1)).toMatchObject({
      only: 'favorites',
      sort: 'newest',
      offset: 0,
      limit: 24,
    })
    expect(cards).toHaveLength(15)
    expect(cards.every((card) => card.dataset.favorite === 'true')).toBe(true)
    expect(screen.getByText('本库共 15 个视频')).toBeInTheDocument()
  })

  it('没有「全部 / 已播放」筛选，收藏页固定为收藏', async () => {
    const { api } = renderFavorites()
    await screen.findAllByTestId('video-card')

    expect(screen.queryByTestId('filter-all')).toBeNull()
    expect(screen.queryByTestId('filter-played')).toBeNull()
    expect(screen.queryByTestId('filter-favorites')).toBeNull()
    expect(api.calls.at(-1)?.only).toBe('favorites')
  })

  it('取消收藏后该记录从收藏页消失', async () => {
    const { api } = renderFavorites()
    const cards = await screen.findAllByTestId('video-card')
    const first = cards[0]!
    const id = Number(first.dataset.videoId)

    fireEvent.click(within(first).getByTestId('favorite-video'))

    await waitFor(() => expect(api.favorites.get(id)).toBe(false))
    await waitFor(() =>
      expect(
        screen
          .queryAllByTestId('video-card')
          .some((card) => card.dataset.videoId === String(id)),
      ).toBe(false),
    )
  })

  it('收藏为空时给出收藏页自己的空态', async () => {
    renderFavorites(makeFakeApi({ videos: [] }))
    expect(await screen.findByText('还没有收藏')).toBeInTheDocument()
    expect(
      screen.getByText('在视频操作菜单中选择收藏，将视频保存到这里'),
    ).toBeInTheDocument()
  })
})
