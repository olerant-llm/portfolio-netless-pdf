import { renderToStaticMarkup } from 'react-dom/server'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DocumentProvider, DocumentState } from '../src/document/documentSession'
import DocumentToolbar from '../src/components/viewer/toolbar/DocumentToolbar'

vi.mock('../src/utils/pdfHelpers', () => ({ loadPdfFromBytes: vi.fn() }))

const doc: DocumentState = {
  bytes: new Uint8Array([1]), pageIds: ['p1', 'p2'], name: '確認用',
  pdfDoc: {}, isDirty: true, digitalSignatureStatus: 'none',
}
const noop = () => {}
const render = (selectedCount: number, isExtracting = false) => renderToStaticMarkup(
  <DocumentProvider>
    <DocumentToolbar
      doc={doc} selectedCount={selectedCount} isExtracting={isExtracting} titleRef={createRef()}
      onOpenFile={noop} onSave={noop} onAddSource={noop} onRotate={noop} onDelete={noop}
      onExtract={noop} onOpenSignature={noop} onOpenTool={noop} onClose={noop}
    />
  </DocumentProvider>,
)

/** 指定した文字を持つボタンの開始タグを返す */
const buttonTag = (html: string, label: string) => {
  const index = html.indexOf(`>${label}<`)
  const start = html.lastIndexOf('<button', index)
  return html.slice(start, html.indexOf('>', start) + 1)
}

describe('DocumentToolbar', () => {
  it('よく使うボタンを文字つきで並べる', () => {
    const html = render(0)
    for (const label of ['開く', '保存', '元に戻す', 'やり直し', 'PDFを追加', '左に回転', '右に回転', '削除', '取り出す', 'トリミング', '署名画像', '仕上げ', '書き出し']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('確認用.pdf')
    expect(html).toContain('未保存')
    expect(html).toContain('aria-label="閉じる"')
    expect(html).toContain('role="toolbar"')
  })

  it('選択がないとき、ページ操作は押せず理由を出す', () => {
    const html = render(0)
    for (const label of ['左に回転', '右に回転', '削除', '署名画像']) {
      const tag = buttonTag(html, label)
      expect(tag).toContain('disabled=""')
      expect(tag).toContain('title="先にページを選んでください"')
    }
  })

  it('選択があるとき、回転と削除を押せる', () => {
    const html = render(1)
    expect(buttonTag(html, '左に回転')).not.toContain('disabled=""')
    expect(buttonTag(html, '削除')).not.toContain('disabled=""')
  })

  it('2枚選んでいるとき、署名画像だけは1枚を求める', () => {
    const tag = buttonTag(render(2), '署名画像')
    expect(tag).toContain('disabled=""')
    expect(tag).toContain('title="ページを1枚だけ選んでください"')
  })

  it('ショートカットをボタンの説明に書く', () => {
    const html = render(0)
    expect(html).toContain('元に戻す（Ctrl+Z）')
    expect(html).toContain('やり直し（Ctrl+Y）')
  })

  it('取り出し中は「取り出す」を押せず、書き出し中と伝える', () => {
    const html = render(1, true)
    const index = html.indexOf('>取り出す<')
    const start = html.lastIndexOf('<button', index)
    const tag = html.slice(start, html.indexOf('>', start) + 1)
    expect(tag).toContain('disabled=""')
    expect(tag).toContain('title="書き出しています…"')
  })
})
