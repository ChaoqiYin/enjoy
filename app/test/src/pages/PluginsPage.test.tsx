import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApiClient } from '../../../src/shared/api'
import { setLanguage } from '../../../src/shared/i18n'
import { ServicesProvider } from '../../../src/shared/services'
import { makeFakeScanEvents } from '../../fakes'
import { makeFakeServer, type FakeServer } from '../../fakeServer'
import { PluginsPage } from '../../../src/pages/PluginsPage'

function renderPlugins(server: FakeServer = makeFakeServer()) {
  render(
    <ServicesProvider
      value={{ api: createApiClient(server.http), scanEvents: makeFakeScanEvents().source }}
    >
      <PluginsPage />
    </ServicesProvider>,
  )
  return server
}

beforeEach(async () => {
  await setLanguage('zh-CN')
})

describe('插件页', () => {
  it('从服务端读取插件清单，空态仍是只读的', async () => {
    const server = renderPlugins()

    expect(await screen.findByText('暂无插件')).toBeInTheDocument()
    expect(screen.getByText('第一版没有应用插件')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(
      server.calls.some(
        (call) => call.method === 'GET' && call.url === '/api/plugins',
      ),
    ).toBe(true)
  })

  it('服务端报告插件时按清单展示名称', async () => {
    renderPlugins(
      makeFakeServer({
        plugins: [{ id: 'demo', name: '示例插件', version: '1.0.0' }],
      }),
    )

    expect(await screen.findByText('示例插件')).toBeInTheDocument()
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
    expect(screen.queryByText('暂无插件')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
