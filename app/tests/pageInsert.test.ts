import { describe, it, expect } from 'vitest'
import {
  inspectFeatureRichPdf,
  makeFeatureRichPdf,
  makeTestPdf,
  pageWidths,
} from './helpers/makePdf'
import { insertPages } from '../src/utils/pageInsert'

describe('insertPages', () => {
  it('2ページと3ページの間に、別PDFの1ページを差し込める', async () => {
    const base = await makeTestPdf([101, 102, 103])
    const source = await makeTestPdf([901, 902])

    // insertAt = 2 → 先頭から2枚目の後ろ（= 102 と 103 の間）
    const result = await insertPages(base, source, [0], 2)

    expect(await pageWidths(result)).toEqual([101, 102, 901, 103])
  })

  it('複数ページをまとめて差し込むと、元の順序が維持される', async () => {
    const base = await makeTestPdf([101, 102])
    const source = await makeTestPdf([901, 902, 903])

    // insertAt = 1 → 1ページ目の後ろ
    const result = await insertPages(base, source, [0, 2], 1)

    expect(await pageWidths(result)).toEqual([101, 901, 903, 102])
  })

  it('先頭（insertAt = 0）に差し込める', async () => {
    const base = await makeTestPdf([101, 102])
    const source = await makeTestPdf([901])

    const result = await insertPages(base, source, [0], 0)

    expect(await pageWidths(result)).toEqual([901, 101, 102])
  })

  it('末尾（insertAt = ページ数）に差し込める', async () => {
    const base = await makeTestPdf([101, 102])
    const source = await makeTestPdf([901])

    const result = await insertPages(base, source, [0], 2)

    expect(await pageWidths(result)).toEqual([101, 102, 901])
  })

  it('追加元のページ同士を結ぶリンクと注釈を保つ', async () => {
    const base = await makeTestPdf([101])
    const source = await makeFeatureRichPdf()

    const result = await insertPages(base, source, [0, 1, 2], 1)
    const summary = await inspectFeatureRichPdf(result)

    expect(await pageWidths(result)).toEqual([101, 101, 102, 103])
    expect(summary.internalLinkTargets).toEqual([
      { from: 1, to: 2 }, { from: 1, to: 3 }, { from: 1, to: 3 },
    ])
    expect(summary.danglingInternalLinkCount).toBe(0)
    expect(summary.externalLinks).toEqual(['https://example.test/'])
    expect(summary.noteCount).toBe(1)
  })
})
