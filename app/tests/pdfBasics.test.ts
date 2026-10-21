import { describe, it, expect } from 'vitest'
import { makeTestPdf, pageWidths } from './helpers/makePdf'

describe('試験用PDFの道具', () => {
  it('指定した幅のページを持つPDFを作れる', async () => {
    const pdfBytes = await makeTestPdf([100, 200, 300])
    const widths = await pageWidths(pdfBytes)
    expect(widths).toEqual([100, 200, 300])
  })
})
