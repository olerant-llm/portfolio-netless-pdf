import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DocumentProvider, DocumentState } from '../src/document/documentSession'
import CropSettings from '../src/components/viewer/panels/CropSettings'
import WatermarkSettings from '../src/components/viewer/panels/WatermarkSettings'
import PageNumberSettings from '../src/components/viewer/panels/PageNumberSettings'
import PasswordSaveSettings from '../src/components/viewer/panels/PasswordSaveSettings'
import RasterPanel from '../src/components/viewer/panels/RasterPanel'

vi.mock('../src/utils/pdfHelpers', () => ({ loadPdfFromBytes: vi.fn() }))

const doc: DocumentState = {
  bytes: new Uint8Array([1]), pageIds: ['page-1'], name: '確認用',
  pdfDoc: {}, isDirty: false, digitalSignatureStatus: 'none',
}
const render = (node: React.ReactNode) => renderToStaticMarkup(<DocumentProvider>{node}</DocumentProvider>)
const noop = () => {}

describe('切り出した設定部品', () => {
  it('トリミング：余白と範囲と適用', () => {
    const html = render(<CropSettings doc={doc} selected={new Set(['page-1'])} onApplied={noop} />)
    for (const text of ['上余白', '選択中のページだけ', 'すべてのページ', '適用']) expect(html).toContain(text)
  })
  it('透かし：文字・色・透明度・大きさ・角度', () => {
    const html = render(<WatermarkSettings onApplied={noop} />)
    for (const text of ['透かしの文字', '色', '透明度', '文字の大きさ', '文字の角度', '>適用<']) expect(html).toContain(text)
  })
  it('ページ番号：書式・開始番号・位置・色・大きさ', () => {
    const html = render(<PageNumberSettings onApplied={noop} />)
    for (const text of ['番号の書式', '開始番号', '左上', '中央下', '文字の色', '文字の大きさ']) expect(html).toContain(text)
  })
  it('パスワード付き保存：2つの入力欄と保存ボタン', () => {
    const html = render(<PasswordSaveSettings doc={doc} onSaved={noop} />)
    for (const text of ['パスワードをもう一度入力', '編集はこのまま続けられます', 'パスワード付きPDFを保存']) expect(html).toContain(text)
  })
  it('白黒化：方式を決めて開くと切替ボタンを出さない', () => {
    const html = render(<RasterPanel initialMode="grayscale" />)
    expect(html).toContain('処理後の見本を確認してから反映します')
    expect(html).not.toContain('data-testid="raster-mode-compress"')
  })
  it('軽量化：画質の選択を出す', () => {
    const html = render(<RasterPanel initialMode="compress" />)
    expect(html).toContain('標準')
  })
})
