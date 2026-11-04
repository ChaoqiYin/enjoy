import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeVideo } from '../../../fakes'
import { VideoBoard } from '../../../../src/features/library/VideoBoard'
import type { VideoActionHandlers } from '../../../../src/features/library/VideoActions'

function makeActions(): VideoActionHandlers {
  return {
    details: vi.fn(),
    play: vi.fn(),
    favorite: vi.fn(),
    share: vi.fn(),
    reveal: vi.fn(),
  }
}

function renderBoard(
  videos = [makeVideo(0)],
  actions: VideoActionHandlers = makeActions(),
  viewMode: 'grid' | 'list' | 'table' = 'grid',
) {
  render(
    <VideoBoard
      viewMode={viewMode}
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

  it('共享按钮交给调用方，按下态跟随记录的 shared 标志', () => {
    const video = makeVideo(0, { shared: false })
    const actions = renderBoard([video])

    const button = screen.getByTestId('share-video')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveAccessibleName('共享')

    fireEvent.click(button)

    expect(actions.share).toHaveBeenCalledWith(video)
    expect(actions.details).not.toHaveBeenCalled()
  })

  it('已共享的记录按钮处于按下态', () => {
    renderBoard([makeVideo(0, { shared: true })])

    expect(screen.getByTestId('share-video')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('share-video')).toHaveAccessibleName('取消共享')
  })

  it('共享标记只在记录已共享时出现，卡片与紧凑行都戴同一枚', () => {
    renderBoard([makeVideo(0, { shared: false })])
    expect(screen.queryByTestId('shared-badge')).toBeNull()
  })

  it('共享记录在卡片上显示共享标记', () => {
    renderBoard([makeVideo(0, { shared: true })])
    expect(screen.getByTestId('shared-badge')).toHaveTextContent('已共享')
  })

  it('共享记录在紧凑行里也显示共享标记', () => {
    renderBoard([makeVideo(0, { shared: true })], makeActions(), 'list')
    expect(
      within(screen.getByTestId('video-row')).getByTestId('shared-badge'),
    ).toHaveTextContent('已共享')
  })

  it('共享记录在表格里显示共享标记与共享按钮', () => {
    renderBoard([makeVideo(0, { shared: true })], makeActions(), 'table')
    const table = within(screen.getByTestId('video-table'))
    expect(table.getByTestId('shared-badge')).toHaveTextContent('已共享')
    expect(table.getByTestId('share-video')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('网格按列宽自适应，不再按断点硬编码列数', () => {
    renderBoard()

    const grid = screen.getByTestId('video-grid')
    expect(grid.className).toContain('minmax(min(200px,100%),1fr)')
    expect(grid.className).not.toContain('grid-cols-2')
  })
})
