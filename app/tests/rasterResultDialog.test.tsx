import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import RasterResultDialog from '../src/components/viewer/dialogs/RasterResultDialog'

const props = {
  operationName: '白黒化',
  originalPreview: 'data:image/webp;base64,AAA',
  resultPreview: 'data:image/webp;base64,BBB',
  originalSize: 1_000_000,
  resultSize: 700_000,
  canApply: true,
  isApplying: false,
  onApply: vi.fn(),
  onCancel: vi.fn(),
}

describe('RasterResultDialog（画像化後の結果確認）', () => {
  it('処理前後の見本と容量を示し、確認後だけ反映できる', () => {
    const html = renderToStaticMarkup(<RasterResultDialog {...props} />)

    expect(html).toContain('role="dialog"')
    expect(html).toContain('白黒化の結果を確認')
    expect(html).toContain('処理前')
    expect(html).toContain('処理後')
    expect(html).toContain('1.0 MB')
    expect(html).toContain('700 KB')
    expect(html).toContain('この結果を反映する')
    expect(html).toContain('元のPDFを残す')
  })

  it('軽量化で容量が減らなければ反映できない理由を示す', () => {
    const html = renderToStaticMarkup(
      <RasterResultDialog
        {...props}
        operationName="軽量化"
        resultSize={1_100_000}
        canApply={false}
      />,
    )

    expect(html).toContain('軽くなりませんでした')
    expect(html).toContain('disabled=""')
  })
})
