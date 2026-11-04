import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeVideo } from '../../../fakes'
import { VideoBoard } from '../../../../src/features/library/VideoBoard'
import type { VideoActionHandlers } from '../../../../src/features/library/VideoActions'

function makeActions(): VideoActionHandlers {
  return {
    details: vi.fn(),
    play: vi.fn(),
    favorite: vi.fn(),
    reveal: vi.fn(),
  }
}

function renderBoard(
  videos = [makeVideo(0)],
  actions: VideoActionHandlers = makeActions(),
) {
  render(
    <VideoBoard
      viewMode="grid"
      videos={videos}
      busy={false}
      actions={actions}
      lastPlayedId={null}
    />,
  )
  return actions
}

describe('视频网格', () => {
  it('缩略图从缩略图接口加载', () => {
    renderBoard([makeVideo(0, { thumbnailPath: '/thumbnails/1.jpg' })])

    expect(screen.getByTestId('video-thumbnail')).toHaveAttribute(
      'src',
      '/api/thumbnails/1',
    )
  })

  it('点击卡片正文打开详情，播放与收藏按钮不会连带打开', () => {
    const video = makeVideo(0, { favorite: false })
    const actions = renderBoard([video])

    fireEvent.click(screen.getByText('Video 01.mp4'))
    expect(actions.details).toHaveBeenCalledWith(video)

    vi.mocked(actions.details).mockClear()
    fireEvent.click(screen.getByRole('button', { name: '播放' }))
    fireEvent.click(screen.getByRole('button', { name: '收藏' }))
    expect(actions.details).not.toHaveBeenCalled()
  })

  it('卡片可以用键盘打开详情', () => {
    const video = makeVideo(0)
    const actions = renderBoard([video])

    fireEvent.keyDown(screen.getByTestId('video-card'), { key: 'Enter' })

    expect(actions.details).toHaveBeenCalledWith(video)
  })

  it('网格按列宽自适应，不再按断点硬编码列数', () => {
    renderBoard()

    const grid = screen.getByTestId('video-grid')
    expect(grid.className).toContain('minmax(min(200px,100%),1fr)')
    expect(grid.className).not.toContain('grid-cols-2')
  })
})
