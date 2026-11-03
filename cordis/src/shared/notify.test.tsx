import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ServicesProvider } from './services'
import { useNotify } from './notify'
import { ToastProvider } from './toast'
import { makeFakeApi, makeFakeScanEvents } from '../test/fakes'

function NotifyButton() {
  const notify = useNotify()
  return (
    <button
      type="button"
      onClick={() => {
        void notify({ title: '扫描完成', body: '新增 2 个视频' })
      }}
    >
      通知
    </button>
  )
}

function renderNotifier(api = makeFakeApi()) {
  render(
    <ServicesProvider value={{ api, scanEvents: makeFakeScanEvents().source }}>
      <ToastProvider>
        <NotifyButton />
      </ToastProvider>
    </ServicesProvider>,
  )
  return api
}

describe('系统通知降级', () => {
  it('有外壳时交给系统通知，不显示页面内 Toast', async () => {
    const api = renderNotifier()

    fireEvent.click(screen.getByText('通知'))

    await waitFor(() =>
      expect(api.nativeCalls.map((call) => call.command)).toContain(
        'notification.show',
      ),
    )
    expect(screen.queryByText('扫描完成')).toBeNull()
  })

  it('unsupported 时转为页面内 Toast', async () => {
    renderNotifier(
      makeFakeApi({
        nativeFailures: {
          'notification.show': { code: 'unsupported', message: '无外壳' },
        },
      }),
    )

    fireEvent.click(screen.getByText('通知'))

    expect(await screen.findByText('扫描完成')).toBeInTheDocument()
    expect(screen.getByText('新增 2 个视频')).toBeInTheDocument()
  })

  it('Toast 可以手动关闭', async () => {
    renderNotifier(
      makeFakeApi({
        nativeFailures: {
          'notification.show': { code: 'unsupported', message: '无外壳' },
        },
      }),
    )

    fireEvent.click(screen.getByText('通知'))
    await screen.findByText('扫描完成')
    fireEvent.click(screen.getByLabelText('关闭'))

    await waitFor(() => expect(screen.queryByText('扫描完成')).toBeNull())
  })
})
