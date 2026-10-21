import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { degrees, PDFArray, PDFDocument, PDFPage } from 'pdf-lib'

import {
  formatPageNumber,
  pageNumberOperation,
  PageNumberOptions,
} from '../src/operations/pageNumberOp'
import { watermarkOperation } from '../src/operations/watermarkOp'
import {
  inspectFeatureRichPdf,
  makeFeatureRichPdf,
  makeTestPdf,
  pageWidths,
} from './helpers/makePdf'

const options: PageNumberOptions = {
  format: 'Page {n} of {total}',
  startNumber: 3,
  position: 'top-right',
  color: '#336699',
  fontSize: 14,
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function contentStreamCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes)
  const contents = doc.getPages()[0].node.Contents()
  if (!contents) return 0
  return contents instanceof PDFArray ? contents.size() : 1
}

describe('formatPageNumber（ページ番号の書式）', () => {
  it('番号と総数を、同じ記号が複数あってもすべて置き換える', () => {
    expect(formatPageNumber('{n}/{total}（{n}）', 3, 5)).toBe('3/5（3）')
  })
})

describe('pageNumberOperation（ページ番号）', () => {
  it('開始番号から連番を付け、指定した書式・位置・色・大きさで全ページへ描く', async () => {
    const drawText = vi.spyOn(PDFPage.prototype, 'drawText')
    const bytes = await makeTestPdf([200, 300, 400])

    await pageNumberOperation({ bytes, pageIds: ['a', 'b', 'c'] }, options)

    expect(drawText.mock.calls.map(([label]) => label)).toEqual([
      'Page 3 of 5', 'Page 4 of 5', 'Page 5 of 5',
    ])
    for (const [, settings] of drawText.mock.calls) {
      expect(settings).toEqual(expect.objectContaining({
        size: 14,
        color: expect.objectContaining({
          red: 0x33 / 255,
          green: 0x66 / 255,
          blue: 0x99 / 255,
        }),
      }))
      expect(settings.x).toBeGreaterThan(100)
      expect(settings.y).toBeGreaterThan(200)
    }
  })

  it('ページ数・ページの目印・紙面寸法を変えず、全ページの描き直しを申告する', async () => {
    const bytes = await makeTestPdf([201, 302])
    const r = await pageNumberOperation({ bytes, pageIds: ['a', 'b'] }, options)

    expect(await pageWidths(r.bytes)).toEqual([201, 302])
    expect(r.pageIds).toEqual(['a', 'b'])
    expect(r.invalidated).toEqual(['a', 'b'])
  })

  it.each([
    [90, 'less', 'greater'],
    [180, 'less', 'less'],
    [270, 'greater', 'less'],
  ] as const)('%i度回転済みのページでも、画面上で正立して右上へ置く', async (
    rotation, xSide, ySide,
  ) => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([200, 400])
    page.setRotation(degrees(rotation))
    const drawText = vi.spyOn(PDFPage.prototype, 'drawText')

    await pageNumberOperation(
      { bytes: await pdf.save(), pageIds: ['a'] },
      options,
    )

    const settings = drawText.mock.calls[0][1]
    expect(settings.rotate).toEqual(expect.objectContaining({ angle: rotation }))
    if (xSide === 'less') expect(settings.x).toBeLessThan(100)
    else expect(settings.x).toBeGreaterThan(100)
    if (ySide === 'less') expect(settings.y).toBeLessThan(200)
    else expect(settings.y).toBeGreaterThan(200)
  })

  it('文書情報・しおり・リンク・注釈・入力欄・添付・ページラベルを保つ', async () => {
    const bytes = await makeFeatureRichPdf()
    const before = await inspectFeatureRichPdf(bytes)
    const r = await pageNumberOperation({ bytes, pageIds: ['a', 'b', 'c'] }, options)

    expect(await inspectFeatureRichPdf(r.bytes)).toEqual(before)
  })

  it('透かしの後へ追加しても、先に描いた内容を残す', async () => {
    const bytes = await makeTestPdf([200])
    const watermarked = await watermarkOperation(
      { bytes, pageIds: ['a'] },
      { text: 'DRAFT', color: '#FF0000', opacity: 0.3, fontSize: 50, rotation: -45 },
    )
    const beforeCount = await contentStreamCount(watermarked.bytes)

    const numbered = await pageNumberOperation(
      { bytes: watermarked.bytes, pageIds: watermarked.pageIds },
      options,
    )

    expect(await contentStreamCount(numbered.bytes)).toBeGreaterThan(beforeCount)
  })

  it('日本語を含む書式には同梱書体を埋め込む', async () => {
    const fontBytes = await readFile(new URL('../public/fonts/NotoSansJP-Regular.otf', import.meta.url))
    const fontData = fontBytes.buffer.slice(
      fontBytes.byteOffset,
      fontBytes.byteOffset + fontBytes.byteLength,
    )
    const fetchFont = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => fontData,
    }))
    vi.stubGlobal('fetch', fetchFont)
    const bytes = await makeTestPdf([200])

    const r = await pageNumberOperation(
      { bytes, pageIds: ['a'] },
      { ...options, format: '{n} / {total} ページ' },
    )

    expect(fetchFont).toHaveBeenCalledWith('./fonts/NotoSansJP-Regular.otf')
    await expect(PDFDocument.load(r.bytes)).resolves.toBeDefined()
  })

  it.each([
    ['空の書式', { format: '   ' }, '書式'],
    ['番号のない書式', { format: '全{total}ページ' }, '{n}'],
    ['小さすぎる開始番号', { startNumber: 0 }, '開始番号'],
    ['不正な色', { color: 'gray' }, '色'],
    ['範囲外の大きさ', { fontSize: 73 }, '大きさ'],
  ])('%sは日本語のお知らせで止まる', async (_name, changed, message) => {
    const bytes = await makeTestPdf([200])

    await expect(pageNumberOperation(
      { bytes, pageIds: ['a'] },
      { ...options, ...changed },
    )).rejects.toThrow(message)
  })

  it('PDFと画面のページ数が違えば、日本語のお知らせで止まる', async () => {
    const bytes = await makeTestPdf([200, 300])

    await expect(pageNumberOperation(
      { bytes, pageIds: ['a'] },
      options,
    )).rejects.toThrow('ページ数')
  })
})
