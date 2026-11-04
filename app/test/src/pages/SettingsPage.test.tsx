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

/** The rail switches panels; the tests open the one they are about. */
function showPanel(value: 'appearance' | 'spaces' | 'folders'): void {
  fireEvent.click(screen.getByTestId(`settings-panel-${value}`))
}

// jsdom does not implement `ResizeObserver`, and the theme control measures
// its track with one. The house answer is a stub here rather than a guard in
// the component — see `beforeEach`, which re-stubs it because `afterEach`
// takes every global back.
class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

/**
 * Picks a theme, the way a pointer does.
 *
 * Not `fireEvent.click`: the control commits on the track's `pointerup`, so a
 * click never reaches it, and jsdom has no `PointerEvent` at all. A
 * `MouseEvent` carries the coordinates and takes the id as an own property,
 * which is all React needs to hand it over as a pointer event.
 */
function chooseTheme(label: string): void {
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 0,
    })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    fireEvent(screen.getByRole('radio', { name: label }), event)
  }
}

beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
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

    const select = await screen.findByLabelText('显示语言')
    expect(select).toHaveTextContent('简体中文')

    fireEvent.click(select)
    fireEvent.click(screen.getByRole('option', { name: 'English' }))

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'General' }),
      ).toBeInTheDocument(),
    )
    expect(server.state.settings.language).toBe('en')
  })

  it('切换亮色与暗色主题立即改到文档上并写入设置', async () => {
    const { server } = renderSettings()
    await screen.findByLabelText('显示语言')

    // Dark is what is in force when the stored preference names nothing.
    expect(
      screen.getByRole('radio', { name: '暗色' }).getAttribute('aria-checked'),
    ).toBe('true')

    chooseTheme('亮色')

    expect(document.documentElement.dataset.theme).toBe('light')
    await waitFor(() => expect(server.state.settings.theme).toBe('light'))

    chooseTheme('暗色')

    expect(document.documentElement.dataset.theme).toBe('dark')
    await waitFor(() => expect(server.state.settings.theme).toBe('dark'))
  })

  it('仓库链接交给外壳打开', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const { server } = renderSettings()
    await screen.findByLabelText('显示语言')

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
    await screen.findByLabelText('显示语言')

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
    await screen.findByLabelText('显示语言')

    chooseTheme('亮色')

    const theme = screen.getByTestId('appearance-theme')
    expect(await within(theme).findByRole('alert')).toHaveTextContent(
      '设置未能保存',
    )

    server.state.settingsWriteFails = false
    fireEvent.click(within(theme).getByRole('button', { name: '重试' }))

    await waitFor(() => expect(server.state.settings.theme).toBe('light'))
    await waitFor(() => expect(within(theme).queryByRole('alert')).toBeNull())
  })

  it('语言保存失败显示在语言设置旁，重试重放这次切换', async () => {
    const { server } = renderSettings(
      makeFakeServer({ settingsWriteFails: true }),
    )
    const select = await screen.findByLabelText('显示语言')

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
  it('扫描进行中禁用新建、重命名与删除，并说明原因', async () => {
    renderSettings(makeFakeServer({ spaces: TWO_SPACES, scanActive: true }))
    showPanel('spaces')

    expect(
      await screen.findByText('扫描进行中，请先完成或取消扫描'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('create-space')).toBeDisabled()
    expect(screen.getByTestId('rename-space-1')).toBeDisabled()
    expect(screen.getByTestId('delete-space-2')).toBeDisabled()
  })

  it('可以新建空间并立即切换过去', async () => {
    renderSettings()
    showPanel('spaces')

    fireEvent.click(await screen.findByTestId('create-space'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('空间名称'), {
      target: { value: '动画' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '确定' }))

    const row = await screen.findByTestId('space-2')
    expect(within(row).getByText('动画')).toBeInTheDocument()
    expect(within(row).getByText('当前')).toBeInTheDocument()
  })

  it('可以重命名空间，确认后才删除', async () => {
    renderSettings(makeFakeServer({ spaces: TWO_SPACES }))
    showPanel('spaces')

    fireEvent.click(await screen.findByTestId('rename-space-2'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('空间名称'), {
      target: { value: '番剧' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '确定' }))

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
    showPanel('folders')

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
    showPanel('folders')
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
    showPanel('folders')
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
    showPanel('folders')

    expect(await screen.findByTestId('folder-1')).toBeInTheDocument()

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
    showPanel('folders')

    const row = await screen.findByTestId('folder-1')
    fireEvent.click(within(row).getByTestId('remove-folder-1'))
    fireEvent.click(await screen.findByTestId('confirm-remove-folder-1'))

    await waitFor(() => expect(screen.queryByTestId('folder-1')).toBeNull())
    expect(server.state.directories).toHaveLength(0)
  })
})

describe('设置页 · 维护', () => {
  it('扫描入口启动当前空间的扫描，随后空间命令被禁用', async () => {
    const server = renderSettings().server
    showPanel('folders')
    await screen.findByTestId('folder-1')

    fireEvent.click(screen.getByTestId('rescan-folders'))

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

    showPanel('spaces')
    await waitFor(() =>
      expect(screen.getByTestId('create-space')).toBeDisabled(),
    )
    expect(screen.getByTestId('space-blocked-notice')).toBeInTheDocument()
  })

  it('全部重建缩略图调用对应接口并给出反馈', async () => {
    const server = renderSettings().server
    showPanel('folders')
    await screen.findByTestId('folder-1')

    fireEvent.click(screen.getByTestId('regenerate-thumbnails'))

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
