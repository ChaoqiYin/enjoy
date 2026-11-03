import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeVideo } from '../../test/fakes'
import { VideoBoard } from './VideoBoard'

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
})
