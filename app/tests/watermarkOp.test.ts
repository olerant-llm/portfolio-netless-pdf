import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, PDFPage } from 'pdf-lib'

import { watermarkOperation, WatermarkOptions } from '../src/operations/watermarkOp'
import {
  inspectFeatureRichPdf,
  makeFeatureRichPdf,
  makeTestPdf,
  pageWidths,
} from './helpers/makePdf'

const options: WatermarkOptions = {
  text: 'CONFIDENTIAL',
  color: '#336699',
  opacity: 0.4,
  fontSize: 48,
  rotation: -30,
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('watermarkOperation（透かし）', () => {
  it('指定した文字・色・透明度・大きさ・角度で全ページへ描く', async () => {
    const drawText = vi.spyOn(PDFPage.prototype, 'drawText')
    const bytes = await makeTestPdf([200, 300])

    await watermarkOperation({ bytes, pageIds: ['a', 'b'] }, options)

    expect(drawText).toHaveBeenCalledTimes(2)
    for (const [text, settings] of drawText.mock.calls) {
      expect(text).toBe('CONFIDENTIAL')
      expect(settings).toEqual(expect.objectContaining({
        size: 48,
        opacity: 0.4,
        rotate: expect.objectContaining({ angle: -30 }),
        color: expect.objectContaining({
          red: 0x33 / 255,
          green: 0x66 / 255,
          blue: 0x99 / 255,
        }),
      }))
    }
  })

  it('ページ数・ページの目印・紙面寸法を変えず、全ページの描き直しを申告する', async () => {
    const bytes = await makeTestPdf([201, 302])
    const r = await watermarkOperation({ bytes, pageIds: ['a', 'b'] }, options)

    expect(await pageWidths(r.bytes)).toEqual([201, 302])
    expect(r.pageIds).toEqual(['a', 'b'])
    expect(r.invalidated).toEqual(['a', 'b'])
  })

  it('文書情報・しおり・リンク・注釈・入力欄・添付・ページラベルを保つ', async () => {
    const bytes = await makeFeatureRichPdf()
    const before = await inspectFeatureRichPdf(bytes)
    const r = await watermarkOperation({ bytes, pageIds: ['a', 'b', 'c'] }, options)

    expect(await inspectFeatureRichPdf(r.bytes)).toEqual(before)
    await expect(PDFDocument.load(r.bytes)).resolves.toBeDefined()
  })

  it('日本語の透かしには同梱書体を埋め込み、開けるPDFを返す', async () => {
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

    const r = await watermarkOperation(
      { bytes, pageIds: ['a'] },
      { ...options, text: '社外秘' },
    )

    expect(fetchFont).toHaveBeenCalledWith('./fonts/NotoSansJP-Regular.otf')
    await expect(PDFDocument.load(r.bytes)).resolves.toBeDefined()
  })

  it('入力データ自体は書き換えない', async () => {
    const bytes = await makeTestPdf([200])
    const original = bytes.slice()

    await watermarkOperation({ bytes, pageIds: ['a'] }, options)

    expect(bytes).toEqual(original)
  })

  it.each([
    ['空の文字', { text: '   ' }, '文字'],
    ['不正な色', { color: 'black' }, '色'],
    ['薄すぎる透明度', { opacity: 0 }, '透明度'],
    ['範囲外の大きさ', { fontSize: 201 }, '大きさ'],
    ['範囲外の角度', { rotation: 181 }, '角度'],
  ])('%sは日本語のお知らせで止まる', async (_name, changed, message) => {
    const bytes = await makeTestPdf([200])

    await expect(watermarkOperation(
      { bytes, pageIds: ['a'] },
      { ...options, ...changed },
    )).rejects.toThrow(message)
  })

  it('PDFと画面のページ数が違えば、日本語のお知らせで止まる', async () => {
    const bytes = await makeTestPdf([200, 300])

    await expect(watermarkOperation(
      { bytes, pageIds: ['a'] },
      options,
    )).rejects.toThrow('ページ数')
  })
})
