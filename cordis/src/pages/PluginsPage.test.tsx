import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { setLanguage } from '../shared/i18n'
import { PluginsPage } from './PluginsPage'

beforeEach(async () => {
  await setLanguage('zh-CN')
})

describe('插件页', () => {
  it('渲染只读空态，不提供安装入口', () => {
    render(<PluginsPage />)

    expect(screen.getByRole('heading', { name: '插件' })).toBeInTheDocument()
    expect(screen.getByText('暂无插件')).toBeInTheDocument()
    expect(screen.getByText('第一版没有应用插件')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
