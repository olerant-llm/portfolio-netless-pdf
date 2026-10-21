import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument } from 'pdf-lib'

import {
  calculateSignaturePlacement,
  detectSignatureImageKind,
  signatureOperation,
} from '../src/operations/signatureOp'
import { inspectFeatureRichPdf, makeFeatureRichPdf, makeTestPdf, makeTestPng } from './helpers/makePdf'

const ONE_PIXEL_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q=='

function makeTestJpeg(): Uint8Array {
  return new Uint8Array(Buffer.from(ONE_PIXEL_JPEG_BASE64, 'base64'))
}

async function contentCounts(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  return doc.getPages().map((page) => {
    const contents = page.node.Contents()
    if (!contents) return 0
    return contents instanceof PDFArray ? contents.size() : 1
  })
}

describe('signatureOperation（署名画像を貼る）', () => {
  it('拡張子や申告形式ではなく、画像の中身でPNGとJPEGを見分ける', () => {
    expect(detectSignatureImageKind(makeTestPng())).toBe('png')
    expect(detectSignatureImageKind(makeTestJpeg())).toBe('jpeg')
    expect(() => detectSignatureImageKind(new TextEncoder().encode('not an image')))
      .toThrow('PNGまたはJPEG')
  })

  it('表示前に異常に大きい画像寸法を拒否する', () => {
    const png = makeTestPng()
    png.set([0x7f, 0xff, 0xff, 0xff], 16)

    expect(() => detectSignatureImageKind(png)).toThrow('大きすぎます')
  })

  it('選んだページだけへ透明PNGを貼り、描き直し対象もそのページだけにする', async () => {
    const bytes = await makeTestPdf([101, 102, 103])
    const before = await contentCounts(bytes)
    const result = await signatureOperation(
      { bytes, pageIds: ['a', 'b', 'c'] },
      {
        pageId: 'b',
        imageBytes: makeTestPng(),
        placement: { left: 0.25, top: 0.4, width: 0.3 },
      },
    )

    const after = await contentCounts(result.bytes)
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBeGreaterThan(before[1])
    expect(after[2]).toBe(before[2])
    expect(result.pageIds).toEqual(['a', 'b', 'c'])
    expect(result.invalidated).toEqual(['b'])
  })

  it('JPEGも受け付ける', async () => {
    const bytes = await makeTestPdf([200])
    const result = await signatureOperation(
      { bytes, pageIds: ['a'] },
      {
        pageId: 'a',
        imageBytes: makeTestJpeg(),
        placement: { left: 0.5, top: 0.5, width: 0.25 },
      },
    )

    expect((await contentCounts(result.bytes))[0]).toBeGreaterThan(0)
  })

  it('しおり・リンク・注釈・入力欄・添付・ページラベルを保つ', async () => {
    const bytes = await makeFeatureRichPdf()
    const before = await inspectFeatureRichPdf(bytes)
    const result = await signatureOperation(
      { bytes, pageIds: ['a', 'b', 'c'] },
      {
        pageId: 'c',
        imageBytes: makeTestPng(),
        placement: { left: 0.1, top: 0.1, width: 0.4 },
      },
    )

    expect(await inspectFeatureRichPdf(result.bytes)).toEqual(before)
  })

  it.each([
    { rotation: 0, expected: { x: 35, y: 140, width: 40, height: 40 } },
    { rotation: 90, expected: { x: 175, y: 60, width: 60, height: 60 } },
    { rotation: 180, expected: { x: 195, y: 220, width: 40, height: 40 } },
    { rotation: 270, expected: { x: 55, y: 300, width: 60, height: 60 } },
  ])('$rotation度回転した切り取り済み紙面で同じ見た目の位置へ置く', ({ rotation, expected }) => {
    const actual = calculateSignaturePlacement(
      { x: 15, y: 30, width: 200, height: 300, rotation },
      { width: 2, height: 2 },
      { left: 0.1, top: 0.5, width: 0.2 },
    )

    expect(actual).toEqual({ ...expected, rotation })
  })

  it('四隅の外を指定しても署名画像を紙面内へ収める', () => {
    const topLeft = calculateSignaturePlacement(
      { x: 0, y: 0, width: 200, height: 100, rotation: 0 },
      { width: 2, height: 1 },
      { left: -1, top: -1, width: 0.5 },
    )
    const bottomRight = calculateSignaturePlacement(
      { x: 0, y: 0, width: 200, height: 100, rotation: 0 },
      { width: 2, height: 1 },
      { left: 2, top: 2, width: 0.5 },
    )

    expect(topLeft).toEqual({ x: 0, y: 50, width: 100, height: 50, rotation: 0 })
    expect(bottomRight).toEqual({ x: 100, y: 0, width: 100, height: 50, rotation: 0 })
  })

  it('縦長画像も縮めて紙面外へ出さない', () => {
    const placement = calculateSignaturePlacement(
      { x: 10, y: 20, width: 200, height: 100, rotation: 0 },
      { width: 1, height: 4 },
      { left: 0.5, top: 0.5, width: 0.8 },
    )

    expect(placement).toEqual({ x: 110, y: 20, width: 25, height: 100, rotation: 0 })
  })

  it('存在しないページやページ数の不一致は日本語で止める', async () => {
    const bytes = await makeTestPdf([200, 300])
    const options = {
      pageId: 'missing',
      imageBytes: makeTestPng(),
      placement: { left: 0, top: 0, width: 0.25 },
    }

    await expect(signatureOperation({ bytes, pageIds: ['a', 'b'] }, options))
      .rejects.toThrow('ページが見つかりません')
    await expect(signatureOperation({ bytes, pageIds: ['a'] }, { ...options, pageId: 'a' }))
      .rejects.toThrow('ページ数')
  })
})
