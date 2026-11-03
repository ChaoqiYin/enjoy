import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Select } from './select'

const OPTIONS = [
  { value: 'newest', label: '最新' },
  { value: 'name', label: '名称' },
  { value: 'played', label: '最近播放' },
] as const

function renderSelect(onChange = vi.fn()) {
  render(
    <Select
      ariaLabel="排序"
      value="newest"
      options={OPTIONS}
      onChange={onChange}
    />,
  )
  return { onChange, trigger: screen.getByRole('combobox', { name: '排序' }) }
}

describe('下拉框', () => {
  it('点击展开，点选项后回传值并收起', () => {
    const { onChange, trigger } = renderSelect()

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const listbox = screen.getByRole('listbox')
    expect(trigger.getAttribute('aria-controls')).toBe(listbox.id)
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: '最新' }).id,
    )

    fireEvent.click(screen.getByRole('option', { name: '名称' }))

    expect(onChange).toHaveBeenCalledWith('name')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('方向键移动活动项，回车选择', () => {
    const { onChange, trigger } = renderSelect()

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: '最新' }).id,
    )

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: '名称' }).id,
    )

    fireEvent.keyDown(trigger, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('name')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('空格打开，Escape 收起且不选择', () => {
    const { onChange, trigger } = renderSelect()

    fireEvent.keyDown(trigger, { key: ' ' })
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('点击组件外部收起', () => {
    const { trigger } = renderSelect()

    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
