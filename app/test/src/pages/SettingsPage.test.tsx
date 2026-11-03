import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../../../src/shared/api'
import { setLanguage } from '../../../src/shared/i18n'
import { ServicesProvider } from '../../../src/shared/services'
import { makeFakeScanEvents } from '../../fakes'
import { makeFakeServer, type FakeServer } from '../../fakeServer'
import { SettingsPage } from '../../../src/pages/SettingsPage'

function renderSettings(server: FakeServer = makeFakeServer()) {
  const scan = makeFakeScanEvents()
  render(
    <ServicesProvider value={{ api: createApiClient(server.http), scanEvents: scan.source }}>
      <SettingsPage />
    </ServicesProvider>,
  )
  return { server, scan }
}

beforeEach(async () => {
  await setLanguage('zh-CN')
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('设置页 · 外观', () => {
  it('读取存储的语言，切换后立即生效并写入设置', async () => {
    const { server } = renderSettings()

    const select = await screen.findByLabelText('语言')
    expect(select).toHaveTextContent('简体中文')

    fireEvent.click(select)
    fireEvent.click(screen.getByRole('option', { name: 'English' }))

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Settings' }),
      ).toBeInTheDocument(),
    )
    expect(server.state.settings.language).toBe('en')
  })

  it('切换亮色与暗色主题立即改到文档上并写入设置', async () => {
    const { server } = renderSettings()
    await screen.findByLabelText('语言')

    fireEvent.click(screen.getByTestId('theme-dark'))

    expect(document.documentElement.dataset.theme).toBe('dark')
    await waitFor(() => expect(server.state.settings.theme).toBe('dark'))

    fireEvent.click(screen.getByTestId('theme-light'))

    expect(document.documentElement.dataset.theme).toBe('light')
    await waitFor(() => expect(server.state.settings.theme).toBe('light'))
  })

  it('跟随系统时按系统偏好决定实际主题', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const { server } = renderSettings()
    await screen.findByLabelText('语言')

    fireEvent.click(screen.getByTestId('theme-system'))

    expect(document.documentElement.dataset.theme).toBe('dark')
    await waitFor(() => expect(server.state.settings.theme).toBe('system'))
  })
  it('仓库链接交给外壳打开', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const { server } = renderSettings()
    await screen.findByLabelText('语言')

    fireEvent.click(screen.getByTestId('open-repository'))

    await waitFor(() =>
      expect(server.calls).toContainEqual({
        method: 'POST',
        url: '/api/native',
        body: {
          command: 'shell.openExternal',
          input: { url: 'https://github.com/ChaoqiYin/enjoy' },
        },
      }),
    )
    expect(open).not.toHaveBeenCalled()
  })

  it('没有外壳时仓库链接退化为 window.open', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    renderSettings(
      makeFakeServer({
        native: () => ({
          ok: false,
          code: 'unsupported',
          message: 'No shell is attached',
        }),
      }),
    )
    await screen.findByLabelText('语言')

    fireEvent.click(screen.getByTestId('open-repository'))

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        'https://github.com/ChaoqiYin/enjoy',
        '_blank',
        'noopener,noreferrer',
      ),
    )
  })
})

const TWO_SPACES = [
  { id: 1, name: '视频库', current: true },
  { id: 2, name: '动画', current: false },
]

describe('设置页 · 写入失败', () => {
  it('主题保存失败显示在主题设置旁，重试成功后消失', async () => {
    const { server } = renderSettings(
      makeFakeServer({ settingsWriteFails: true }),
    )
    await screen.findByLabelText('语言')

    fireEvent.click(screen.getByTestId('theme-dark'))

    const theme = screen.getByTestId('appearance-theme')
    expect(await within(theme).findByRole('alert')).toHaveTextContent(
      '设置未能保存',
    )

    server.state.settingsWriteFails = false
    fireEvent.click(within(theme).getByRole('button', { name: '重试' }))

    await waitFor(() => expect(server.state.settings.theme).toBe('dark'))
    await waitFor(() => expect(within(theme).queryByRole('alert')).toBeNull())
  })

  it('语言保存失败显示在语言设置旁，重试重放这次切换', async () => {
    const { server } = renderSettings(
      makeFakeServer({ settingsWriteFails: true }),
    )
    const select = await screen.findByLabelText('语言')

    fireEvent.click(select)
    fireEvent.click(screen.getByRole('option', { name: 'English' }))

    const language = screen.getByTestId('appearance-language')
    expect(await within(language).findByRole('alert')).toHaveTextContent(
      'Could not save this setting',
    )

    server.state.settingsWriteFails = false
    fireEvent.click(within(language).getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(server.state.settings.language).toBe('en'))
    await waitFor(() => expect(within(language).queryByRole('alert')).toBeNull())
  })
})

describe('设置页 · 空间', () => {
  it('扫描进行中禁用新建、重命名、切换与删除，并说明原因', async () => {
    renderSettings(makeFakeServer({ spaces: TWO_SPACES, scanActive: true }))

    expect(
      await screen.findByText('正在扫描，暂时不能修改空间'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('new-space-name')).toBeDisabled()
    expect(screen.getByTestId('create-space')).toBeDisabled()
    expect(screen.getByTestId('rename-space-1')).toBeDisabled()
    expect(screen.getByTestId('switch-space-2')).toBeDisabled()
    expect(screen.getByTestId('delete-space-2')).toBeDisabled()
  })

  it('可以新建空间并立即切换过去', async () => {
    renderSettings()

    const input = await screen.findByTestId('new-space-name')
    fireEvent.change(input, { target: { value: '动画' } })
    fireEvent.click(screen.getByTestId('create-space'))

    const row = await screen.findByTestId('space-2')
    expect(within(row).getByText('动画')).toBeInTheDocument()
    expect(within(row).getByText('当前')).toBeInTheDocument()
  })

  it('可以切换当前空间', async () => {
    renderSettings(makeFakeServer({ spaces: TWO_SPACES }))

    fireEvent.click(await screen.findByTestId('switch-space-2'))

    await waitFor(() =>
      expect(
        within(screen.getByTestId('space-2')).getByText('当前'),
      ).toBeInTheDocument(),
    )
    expect(
      within(screen.getByTestId('space-1')).queryByText('当前'),
    ).toBeNull()
  })

  it('可以重命名空间，确认后才删除', async () => {
    renderSettings(makeFakeServer({ spaces: TWO_SPACES }))

    fireEvent.click(await screen.findByTestId('rename-space-2'))
    fireEvent.change(screen.getByTestId('rename-input-2'), {
      target: { value: '番剧' },
    })
    fireEvent.click(screen.getByTestId('save-space-2'))

    expect(await screen.findByText('番剧')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('delete-space-2'))
    expect(screen.getByTestId('space-2')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('confirm-delete-space-2'))

    await waitFor(() => expect(screen.queryByTestId('space-2')).toBeNull())
  })
})

describe('设置页 · 目录', () => {
  it('添加目录时优先用原生选择器，并把返回的路径写入当前空间', async () => {
    const server = makeFakeServer({
      native: (command) =>
        command === 'path.chooseDirectory'
          ? { ok: true, value: { paths: ['/media/a', '/media/b'] } }
          : { ok: true, value: {} },
    })
    renderSettings(server)

    expect(await screen.findByText('/media/videos')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('add-folder'))

    expect(await screen.findByText('/media/a')).toBeInTheDocument()
    expect(screen.getByText('/media/b')).toBeInTheDocument()
    expect(server.state.directories.map((directory) => directory.path)).toEqual([
      '/media/videos',
      '/media/a',
      '/media/b',
    ])
  })

  it('原生选择器不支持时退化为手填绝对路径', async () => {
    const server = makeFakeServer({
      native: () => ({ ok: false, code: 'unsupported', message: 'no shell' }),
    })
    renderSettings(server)
    await screen.findByText('/media/videos')

    fireEvent.click(screen.getByTestId('add-folder'))

    const input = await screen.findByTestId('manual-folder-path')
    fireEvent.change(input, { target: { value: '/media/manual' } })
    fireEvent.click(screen.getByTestId('add-manual-folder'))

    expect(await screen.findByText('/media/manual')).toBeInTheDocument()
    expect(server.state.directories.map((directory) => directory.path)).toContain(
      '/media/manual',
    )
  })

  it('手填相对路径被拒绝，不写入目录', async () => {
    const server = makeFakeServer({
      native: () => ({ ok: false, code: 'unsupported', message: 'no shell' }),
    })
    renderSettings(server)
    await screen.findByText('/media/videos')
    fireEvent.click(screen.getByTestId('add-folder'))

    fireEvent.change(await screen.findByTestId('manual-folder-path'), {
      target: { value: 'relative/videos' },
    })
    fireEvent.click(screen.getByTestId('add-manual-folder'))

    expect(await screen.findByText('请输入绝对路径')).toBeInTheDocument()
    expect(server.state.directories).toHaveLength(1)
  })

  it('显示媒体工具检测结果：找到的路径与缺失提示', async () => {
    const server = makeFakeServer({
      mediaTools: { ffmpeg: '/opt/homebrew/bin/ffmpeg', ffprobe: null },
    })
    renderSettings(server)
    await screen.findByTestId('folder-1')

    expect(await screen.findByTestId('media-tool-ffmpeg')).toHaveTextContent(
      '已找到：/opt/homebrew/bin/ffmpeg',
    )
    expect(screen.getByTestId('media-tool-ffprobe')).toHaveTextContent(
      '未找到（扫描仍会进行，但媒体信息为空）',
    )
    expect(
      server.calls.some(
        (call) => call.method === 'GET' && call.url === '/api/media/tools',
      ),
    ).toBe(true)
  })

  it('可以删除当前空间的目录', async () => {
    const server = renderSettings().server

    const row = await screen.findByTestId('folder-1')
    fireEvent.click(within(row).getByTestId('remove-folder-1'))

    await waitFor(() => expect(screen.queryByTestId('folder-1')).toBeNull())
    expect(server.state.directories).toHaveLength(0)
  })
})

describe('设置页 · 插件', () => {
  it('只读显示暂无插件，且没有安装入口', async () => {
    renderSettings()
    await screen.findByTestId('folder-1')

    expect(await screen.findByText('暂无插件')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /安装/ })).toBeNull()
  })
})

describe('设置页 · 维护', () => {
  it('扫描入口启动当前空间的扫描，随后空间命令被禁用', async () => {
    const server = renderSettings().server
    await screen.findByTestId('folder-1')

    fireEvent.click(screen.getByTestId('start-scan'))

    expect(await screen.findByText('扫描已开始')).toBeInTheDocument()
    expect(
      server.calls.some(
        (call) =>
          call.method === 'POST' &&
          call.url === '/api/scan' &&
          (call.body as { spaceId?: number }).spaceId === 1,
      ),
    ).toBe(true)
    expect(server.state.scanActive).toBe(true)
    await waitFor(() =>
      expect(screen.getByTestId('create-space')).toBeDisabled(),
    )
    expect(screen.getByTestId('space-blocked-notice')).toBeInTheDocument()
  })

  it('全部重建缩略图调用对应接口并给出反馈', async () => {
    const server = renderSettings().server
    await screen.findByTestId('folder-1')

    fireEvent.click(screen.getByTestId('rebuild-thumbnails'))

    expect(await screen.findByText('缩略图重建已开始')).toBeInTheDocument()
    expect(
      server.calls.some(
        (call) =>
          call.method === 'POST' && call.url === '/api/thumbnails/rebuild',
      ),
    ).toBe(true)
    expect(server.state.scanActive).toBe(true)
  })
})
