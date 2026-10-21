import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { selectionForContextMenu } from '../src/components/viewer/toolbar/contextSelection'
import { isTextEntryTarget } from '../src/components/viewer/toolbar/keyTarget'
import PageContextMenu from '../src/components/viewer/toolbar/PageContextMenu'
import StatusStrip from '../src/components/viewer/toolbar/StatusStrip'

describe('右クリック時の選択', () => {
  it('選択外のページなら、そのページ1枚に選び直す', () => {
    expect([...selectionForContextMenu(new Set(['a', 'b']), 'c')]).toEqual(['c'])
  })
  it('選択内のページなら、選択をそのまま使う', () => {
    const selected = new Set(['a', 'b'])
    expect(selectionForContextMenu(selected, 'a')).toBe(selected)
  })
})

describe('isTextEntryTarget', () => {
  it('入力欄を見分ける（node 環境なので closest を持つ偽物で確かめる）', () => {
    const fake = (hit: boolean) => ({ closest: () => (hit ? {} : null) }) as unknown as EventTarget
    expect(isTextEntryTarget(fake(true))).toBe(true)
    expect(isTextEntryTarget(fake(false))).toBe(false)
    expect(isTextEntryTarget(null)).toBe(false)
  })
})

describe('PageContextMenu と StatusStrip', () => {
  it('右クリックメニューに5項目を出す', () => {
    const noop = () => {}
    const html = renderToStaticMarkup(
      <PageContextMenu x={10} y={10} onRotate={noop} onDelete={noop} onExtract={noop} onZoom={noop} onClose={noop} />,
    )
    for (const label of ['左に回転', '右に回転', '削除', '取り出す', '拡大表示']) expect(html).toContain(label)
    expect(html).toContain('role="menu"')
  })
  it('選択中は数と選択解除を出す', () => {
    const html = renderToStaticMarkup(<StatusStrip selectedCount={3} undoLimit={null} onClear={() => {}} />)
    expect(html).toContain('3ページを選択中')
    expect(html).toContain('選択を解除')
  })
  it('未選択は使い方を出し、履歴の上限も伝える', () => {
    const html = renderToStaticMarkup(<StatusStrip selectedCount={0} undoLimit={2} onClear={() => {}} />)
    expect(html).toContain('右クリックでメニュー')
    expect(html).toContain('Ctrl+クリックで追加')
    expect(html).toContain('Shift+クリックで範囲')
    expect(html).toContain('元に戻せるのは直近2回まで')
  })
})
