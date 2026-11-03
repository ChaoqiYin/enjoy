import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from '../../../src/shared/toast'

function Buttons() {
  const toast = useToast()
  return (
    <div>
      <button
        type="button"
        onClick={() => toast.show({ title: '保存成功', variant: 'success' })}
      >
        成功
      </button>
      <button
        type="button"
        onClick={() => toast.show({ title: '第二条成功', variant: 'success' })}
      >
        成功二
      </button>
      <button
        type="button"
        onClick={() => toast.show({ title: '保存失败', variant: 'error' })}
      >
        错误
      </button>
      <button
        type="button"
        onClick={() => toast.show({ title: '一条信息', variant: 'info' })}
      >
        信息
      </button>
    </div>
  )
}

function renderToasts() {
  render(
    <ToastProvider>
      <Buttons />
    </ToastProvider>,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('页面内通知', () => {
  it('错误用 alert 语义且不会自动消失', () => {
    vi.useFakeTimers()
    renderToasts()

    fireEvent.click(screen.getByText('错误'))

    expect(screen.getByRole('alert')).toHaveTextContent('保存失败')
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败')
  })

  it('非错误只保留最新一条，旧的被顶掉', () => {
    renderToasts()

    fireEvent.click(screen.getByText('成功'))
    expect(screen.getByText('保存成功')).toBeInTheDocument()

    fireEvent.click(screen.getByText('成功二'))

    expect(screen.queryByText('保存成功')).toBeNull()
    expect(screen.getByText('第二条成功')).toBeInTheDocument()
  })

  it('新的非错误不会顶掉错误，错误可以继续叠加', () => {
    renderToasts()

    fireEvent.click(screen.getByText('错误'))
    fireEvent.click(screen.getByText('成功'))
    fireEvent.click(screen.getByText('信息'))

    expect(screen.getByText('保存失败')).toBeInTheDocument()
    expect(screen.queryByText('保存成功')).toBeNull()
    expect(screen.getByText('一条信息')).toBeInTheDocument()
  })

  it('非错误在五秒后自动关闭', () => {
    vi.useFakeTimers()
    renderToasts()

    fireEvent.click(screen.getByText('成功'))
    expect(screen.getByText('保存成功')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText('保存成功')).toBeNull()
  })

  it('通知容器固定在右上角', () => {
    renderToasts()
    fireEvent.click(screen.getByText('信息'))

    const host = document.querySelector('[data-notification-host]')!
    expect(host.className).toContain('top-4')
    expect(host.className).toContain('right-4')
  })
})
