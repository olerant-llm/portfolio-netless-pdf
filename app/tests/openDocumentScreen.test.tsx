import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DocumentProvider } from '../src/document/documentSession'
import OpenDocumentScreen from '../src/components/viewer/OpenDocumentScreen'
import NewImagePdfScreen from '../src/components/viewer/NewImagePdfScreen'
import { makeTestPng } from './helpers/makePdf'

vi.mock('../src/utils/pdfHelpers', () => ({
  loadPdfFromBytes: vi.fn(),
}))

describe('起動画面', () => {
  it('PDFを開く入口と、画像から作る入口を分けて表示する', () => {
    const html = renderToStaticMarkup(
      <DocumentProvider><OpenDocumentScreen /></DocumentProvider>,
    )

    expect(html).toContain('PDFを開く')
    expect(html).toContain('画像から新しいPDFを作る')
    expect(html).toContain('PNG・JPEG')
  })

  it('画像の確認画面に、並べ替え・追加・削除・作成の案内を表示する', () => {
    const html = renderToStaticMarkup(
      <DocumentProvider><NewImagePdfScreen
        initialImages={[{
          id: 'image-1',
          name: '写真.png',
          bytes: makeTestPng(),
          previewUrl: 'blob:image-1',
        }]}
        onCancel={() => undefined}
      /></DocumentProvider>,
    )

    expect(html).toContain('画像の順番を確認')
    expect(html).toContain('写真.png')
    expect(html).toContain('画像を追加')
    expect(html).toContain('この順番でPDFを作る')
    expect(html).toContain('削除')
  })
})
