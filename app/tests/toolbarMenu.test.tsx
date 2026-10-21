import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { nextMenuIndex } from '../src/components/viewer/toolbar/menuKeys'
import ToolbarMenu from '../src/components/viewer/toolbar/ToolbarMenu'
import ToolDialog from '../src/components/viewer/toolbar/ToolDialog'

describe('nextMenuIndex', () => {
  it('上下キーで循環する', () => {
    expect(nextMenuIndex(0, 'ArrowDown', 3)).toBe(1)
    expect(nextMenuIndex(2, 'ArrowDown', 3)).toBe(0)
    expect(nextMenuIndex(0, 'ArrowUp', 3)).toBe(2)
  })
  it('Home と End で端へ移る', () => {
    expect(nextMenuIndex(1, 'Home', 3)).toBe(0)
    expect(nextMenuIndex(1, 'End', 3)).toBe(2)
  })
  it('それ以外のキーでは動かない', () => {
    expect(nextMenuIndex(1, 'a', 3)).toBe(1)
  })
})

describe('ToolbarMenu', () => {
  it('閉じている間は見出しボタンだけを出し、開閉状態を伝える', () => {
    const html = renderToStaticMarkup(
      <ToolbarMenu label="仕上げ" icon={null} items={[{ id: 'a', label: '透かし', onSelect: () => {} }]} />,
    )
    expect(html).toContain('仕上げ')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('透かし')
  })
})

describe('ToolDialog', () => {
  it('見出しと中身と閉じるボタンを出す', () => {
    const html = renderToStaticMarkup(
      <ToolDialog title="透かし" onClose={() => {}}><p>中身</p></ToolDialog>,
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('透かし')
    expect(html).toContain('中身')
    expect(html).toContain('aria-label="閉じる"')
  })
  it('処理中は閉じるボタンを押せない', () => {
    const html = renderToStaticMarkup(
      <ToolDialog title="白黒にする" onClose={() => {}} locked><p>処理中</p></ToolDialog>,
    )
    expect(html).toMatch(/aria-label="閉じる"[^>]*disabled|disabled[^>]*aria-label="閉じる"/)
  })
})
