import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Tooltip } from './tooltip'

afterEach(() => {
  vi.useRealTimers()
})

describe('轻量提示', () => {
  it('悬停达到延迟后显示，移出后收起', () => {
    vi.useFakeTimers()
    render(
      <Tooltip label="完整文件名" delay={700}>
        <span>截断的文件…</span>
      </Tooltip>,
    )

    fireEvent.mouseOver(screen.getByText('截断的文件…'))
    expect(screen.queryByRole('tooltip')).toBeNull()

    act(() => vi.advanceTimersByTime(700))
    expect(screen.getByRole('tooltip')).toHaveTextContent('完整文件名')

    fireEvent.mouseOut(screen.getByText('截断的文件…'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('焦点进入可聚焦子元素时同样显示', () => {
    vi.useFakeTimers()
    render(
      <Tooltip label="完整文件名" delay={0}>
        <button type="button">查看</button>
      </Tooltip>,
    )

    fireEvent.focus(screen.getByRole('button', { name: '查看' }))
    act(() => vi.advanceTimersByTime(0))

    expect(screen.getByRole('tooltip')).toHaveTextContent('完整文件名')

    fireEvent.blur(screen.getByRole('button', { name: '查看' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
