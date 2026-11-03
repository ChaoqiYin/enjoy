import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeVideo } from '../../../fakes'
import { VideoBoard } from '../../../../src/features/library/VideoBoard'

describe('视频网格', () => {
  it('缩略图从缩略图接口加载', () => {
    render(
      <VideoBoard
        viewMode="grid"
        videos={[makeVideo(0)]}
        onPlay={vi.fn()}
        onToggleFavorite={vi.fn()}
      />,
    )

    expect(screen.getByTestId('video-thumbnail')).toHaveAttribute(
      'src',
      '/api/thumbnails/1',
    )
  })

  it('点击卡片正文打开详情，播放与收藏按钮不会连带打开', () => {
    const video = makeVideo(0)
    const onOpenDetail = vi.fn()
    render(
      <VideoBoard
        viewMode="grid"
        videos={[video]}
        onPlay={vi.fn()}
        onToggleFavorite={vi.fn()}
        onOpenDetail={onOpenDetail}
      />,
    )

    fireEvent.click(screen.getByText('Video 01.mp4'))
    expect(onOpenDetail).toHaveBeenCalledWith(video)

    onOpenDetail.mockClear()
    fireEvent.click(screen.getByTestId('play-video'))
    fireEvent.click(screen.getByTestId('favorite-video'))
    expect(onOpenDetail).not.toHaveBeenCalled()
  })

  it('卡片可以用键盘打开详情', () => {
    const video = makeVideo(0)
    const onOpenDetail = vi.fn()
    render(
      <VideoBoard
        viewMode="grid"
        videos={[video]}
        onPlay={vi.fn()}
        onToggleFavorite={vi.fn()}
        onOpenDetail={onOpenDetail}
      />,
    )

    fireEvent.keyDown(screen.getByTestId('video-card'), { key: 'Enter' })

    expect(onOpenDetail).toHaveBeenCalledWith(video)
  })

  it('网格按列宽自适应，不再按断点硬编码列数', () => {
    render(
      <VideoBoard
        viewMode="grid"
        videos={[makeVideo(0)]}
        onPlay={vi.fn()}
        onToggleFavorite={vi.fn()}
      />,
    )

    const grid = screen.getByTestId('video-grid')
    expect(grid.style.gridTemplateColumns).toBe(
      'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
    )
    expect(grid.className).not.toContain('grid-cols-2')
  })
})
