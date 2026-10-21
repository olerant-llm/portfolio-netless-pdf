import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import LossyOperationGuard from '../src/components/viewer/dialogs/LossyOperationGuard'
import { RASTERIZATION_INFORMATION_LOSSES } from '../src/operations/lossyRasterOp'

describe('LossyOperationGuard（画像への焼き直し前の確認）', () => {
  it('失う情報を省略せず列挙し、安全側の選択肢を示す', () => {
    const html = renderToStaticMarkup(
      <LossyOperationGuard
        operationName="白黒化"
        losses={RASTERIZATION_INFORMATION_LOSSES}
        onProceed={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain('白黒化の前に確認してください')
    for (const loss of RASTERIZATION_INFORMATION_LOSSES) expect(html).toContain(loss)
    expect(html).toContain('元のPDFを残す')
    expect(html).toContain('内容を理解して処理する')
  })
})
