import { act } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ServicesProvider } from '../../../../src/shared/services'
import { ToastProvider } from '../../../../src/shared/toast'
import { ScanDialogHost } from '../../../../src/features/scan/ScanDialogHost'
import {
  makeFakeApi,
  makeFakeScanEvents,
  type FakeApi,
  type FakeScanEvents,
} from '../../../fakes'
import type { ScanStatus } from '../../../../src/shared/api'

function activeStatus(overrides: Partial<ScanStatus> = {}): ScanStatus {
  return {
    active: true,
    scanId: 'scan-1',
    spaceId: 1,
    phase: 'indexing',
    changes: { added: 2, updated: 1, removed: 0 },
    failures: 2,
    unreachableDirectories: 1,
    discovered: 10,
    processed: 5,
    indexed: 4,
    metadataReady: 3,
    thumbnailsReady: 2,
    currentPath: '/media/one.mp4',
    ...overrides,
  }
}

function renderHost(
  api: FakeApi = makeFakeApi(),
  scan: FakeScanEvents = makeFakeScanEvents(),
) {
  render(
    <ServicesProvider value={{ api, scanEvents: scan.source }}>
      <ToastProvider>
        <ScanDialogHost />
      </ToastProvider>
    </ServicesProvider>,
  )
  return { api, scan }
}

describe('扫描 dialog 宿主', () => {
  it('应用重启没有扫描时什么都不显示', async () => {
    const { api } = renderHost()

    await waitFor(() => expect(api.scan.statusCalls).toBe(1))
    expect(screen.queryByTestId('scan-dialog')).toBeNull()
  })

  it('挂载时已有扫描就显示阶段、路径、计数与失败数', async () => {
    renderHost(makeFakeApi({ scanStatus: activeStatus() }))

    const dialog = await screen.findByTestId('scan-dialog')
    expect(dialog).toHaveTextContent('正在索引视频')
    expect(screen.getByTestId('scan-current-path')).toHaveTextContent(
      '/media/one.mp4',
    )
    expect(screen.getByTestId('scan-discovered')).toHaveTextContent('10')
    expect(screen.getByTestId('scan-indexed')).toHaveTextContent('4')
    expect(screen.getByTestId('scan-metadata')).toHaveTextContent('3')
    expect(screen.getByTestId('scan-thumbnails')).toHaveTextContent('2')
    expect(screen.getByTestId('scan-failures')).toHaveTextContent('2')
    expect(screen.getByTestId('scan-unreachable')).toHaveTextContent('1')
  })

  it('暂停后显示继续，继续后回到暂停', async () => {
    const { api } = renderHost(makeFakeApi({ scanStatus: activeStatus() }))
    await screen.findByTestId('scan-dialog')

    fireEvent.click(screen.getByTestId('scan-pause'))
    await waitFor(() =>
      expect(api.scan.controls).toEqual([
        { scanId: 'scan-1', action: 'pause' },
      ]),
    )
    const resume = await screen.findByTestId('scan-resume')

    fireEvent.click(resume)
    await waitFor(() =>
      expect(api.scan.controls.at(-1)).toEqual({
        scanId: 'scan-1',
        action: 'resume',
      }),
    )
    expect(await screen.findByTestId('scan-pause')).toBeInTheDocument()
  })

  it('取消后等真正停止才关闭 dialog', async () => {
    const { api, scan } = renderHost(makeFakeApi({ scanStatus: activeStatus() }))
    await screen.findByTestId('scan-dialog')

    fireEvent.click(screen.getByTestId('scan-cancel'))
    await waitFor(() =>
      expect(api.scan.controls).toEqual([
        { scanId: 'scan-1', action: 'cancel' },
      ]),
    )
    expect(screen.getByTestId('scan-dialog')).toBeInTheDocument()

    scan.emit({ scanId: 'scan-1', spaceId: 1, phase: 'cancelled' })

    await waitFor(() => expect(screen.queryByTestId('scan-dialog')).toBeNull())
  })

  it('完成事件关闭 dialog 并发出完成通知', async () => {
    const { scan } = renderHost(
      makeFakeApi({
        scanStatus: activeStatus(),
        nativeFailures: {
          'notification.show': { code: 'unsupported', message: '无外壳' },
        },
      }),
    )
    await screen.findByTestId('scan-dialog')

    scan.emit({ scanId: 'scan-1', spaceId: 1, phase: 'done' })

    await waitFor(() => expect(screen.queryByTestId('scan-dialog')).toBeNull())
    expect(await screen.findByText('扫描完成')).toBeInTheDocument()
  })

  it('挂载时的空间与事件里的空间不同，扫描仍会显示', async () => {
    const { api, scan } = renderHost()
    await waitFor(() => expect(api.scan.statusCalls).toBe(1))
    // The status arrives as a promise; let its render (and the subscription)
    // commit before frames start arriving.
    await act(async () => {})
    expect(screen.queryByTestId('scan-dialog')).toBeNull()

    scan.emit({ scanId: 'other', spaceId: 2, phase: 'indexing' })

    expect(await screen.findByTestId('scan-dialog')).toHaveTextContent(
      '正在索引视频',
    )
  })

  it('断线重连后先取一次状态再继续显示进度', async () => {
    const api = makeFakeApi()
    const { scan } = renderHost(api)
    await waitFor(() => expect(api.scan.statusCalls).toBe(1))

    api.scan.status = activeStatus({ phase: 'metadata' })
    scan.connect(true)

    await waitFor(() => expect(api.scan.statusCalls).toBe(2))
    expect(await screen.findByTestId('scan-dialog')).toHaveTextContent(
      '正在读取元数据',
    )

    scan.emit({ scanId: 'scan-1', spaceId: 1, phase: 'thumbnails' })
    expect(await screen.findByTestId('scan-dialog')).toHaveTextContent(
      '正在生成缩略图',
    )
  })
})
