import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeFakeApi, makeFakeScanEvents, makeVideo } from '../../test/fakes'
import { ServicesProvider } from '../../shared/services'
import { VideoDetailDialog } from './VideoDetailDialog'

function renderDetail(options: { canReveal?: boolean } = {}) {
  const api = makeFakeApi({
    videos: [makeVideo(0, { favorite: true })],
  })
  const scan = makeFakeScanEvents()
  const onPlay = vi.fn()
  const onReveal = vi.fn()
  const onClose = vi.fn()
  render(
    <ServicesProvider value={{ api, scanEvents: scan.source }}>
      <VideoDetailDialog
        videoId={1}
        canReveal={options.canReveal ?? false}
        onPlay={onPlay}
        onReveal={onReveal}
        onToggleFavorite={async (video) => {
          await api.setFavorite(video.id, !video.favorite)
        }}
        onClose={onClose}
      />
    </ServicesProvider>,
  )
  return { api, onPlay, onReveal, onClose }
}

describe('视频详情', () => {
  it('读取单条记录并展示文件名、路径、大小、时长、分辨率、编码与收藏状态', async () => {
    const { api } = renderDetail()

    expect(await screen.findByTestId('video-detail-dialog')).toBeInTheDocument()
    expect(api.detailReads).toEqual([1])
    expect(screen.getByTestId('detail-name')).toHaveTextContent('Video 01.mp4')
    expect(screen.getByTestId('detail-path')).toHaveTextContent(
      '/media/Video 01.mp4',
    )
    expect(screen.getByTestId('detail-size')).toHaveTextContent('MB')
    expect(screen.getByTestId('detail-duration')).toHaveTextContent('01:00')
    expect(screen.getByTestId('detail-resolution')).toHaveTextContent(
      '1920 × 1080',
    )
    expect(screen.getByTestId('detail-codec')).toHaveTextContent('h264')
    expect(screen.getByTestId('detail-favorite')).toHaveTextContent('已收藏')
  })

  it('收藏按钮切换状态并更新详情', async () => {
    const { api } = renderDetail()
    const button = await screen.findByTestId('detail-favorite-toggle')
    expect(button).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(button)

    expect(await screen.findByTestId('detail-favorite')).toHaveTextContent(
      '未收藏',
    )
    expect(api.favorites.get(1)).toBe(false)
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('播放与关闭交给调用方，定位只在桌面外壳里出现', async () => {
    const { onPlay, onReveal, onClose } = renderDetail({ canReveal: true })
    await screen.findByTestId('video-detail-dialog')

    fireEvent.click(screen.getByTestId('detail-play'))
    expect(onPlay).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, fileName: 'Video 01.mp4' }),
    )

    fireEvent.click(screen.getByTestId('detail-reveal'))
    expect(onReveal).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, path: '/media/Video 01.mp4' }),
    )

    fireEvent.click(screen.getByTestId('detail-close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('浏览器模式不显示定位按钮', async () => {
    renderDetail({ canReveal: false })
    await screen.findByTestId('video-detail-dialog')

    expect(screen.queryByTestId('detail-reveal')).toBeNull()
  })
})
