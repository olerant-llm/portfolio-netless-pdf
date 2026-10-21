import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DocumentProvider, type OpenFailureState } from '../src/document/documentSession'
import OpenFailurePrompt from '../src/components/viewer/OpenFailurePrompt'

vi.mock('../src/utils/pdfHelpers', () => ({
  loadPdfFromBytes: vi.fn(),
}))

const candidate = (reason: OpenFailureState['reason']): OpenFailureState => ({
  reason,
  bytes: new Uint8Array([1, 2, 3]),
  name: '開けない資料',
})

const renderPrompt = (failure: OpenFailureState) => renderToStaticMarkup(
  <DocumentProvider><OpenFailurePrompt failure={failure} /></DocumentProvider>,
)

describe('PDFを開けなかったときの案内', () => {
  it('壊れた可能性がある場合だけ、修復を試す入口を出す', () => {
    const html = renderPrompt(candidate('broken'))

    expect(html).toContain('開けない資料.pdf')
    expect(html).toContain('修復を試す')
    expect(html).not.toContain('type="password"')
  })

  it('パスワード付きの場合は入力欄を出し、修復扱いにしない', () => {
    const html = renderPrompt(candidate('password-protected'))

    expect(html).toContain('パスワードを入力')
    expect(html).toContain('type="password"')
    expect(html).not.toContain('修復を試す')
  })

  it('閲覧できても編集が制限されている場合は、所有者用パスワードを案内する', () => {
    const html = renderPrompt(candidate('editing-restricted'))

    expect(html).toContain('編集が制限されています')
    expect(html).toContain('所有者用パスワード')
    expect(html).toContain('電子署名がある場合は無効になります')
    expect(html).toContain('type="password"')
    expect(html).not.toContain('電子署名の有無を確認できません')
    expect(html).not.toContain('修復を試す')
  })

  it('編集を許可された暗号化PDFは、パスワード入力なしで保護解除へ進める', () => {
    const html = renderPrompt(candidate('editing-protected'))

    expect(html).toContain('編集の前に保護を外します')
    expect(html).toContain('パスワードは不要です')
    expect(html).toContain('保護を外して開く')
    expect(html).not.toContain('type="password"')
  })
})
