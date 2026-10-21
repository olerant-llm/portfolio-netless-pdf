import { describe, it, expect } from 'vitest'
import { makeTestPdf, pageWidths, makeTestPng } from './helpers/makePdf'
import { addFromPdf, imagesToPdfBytes } from '../src/operations/addOp'

const png = () => ({ name: 'てすと.png', bytes: makeTestPng() })

describe('addFromPdf（別のPDFからページを足す）', () => {
  it('入れる位置を指定しなければ、末尾に足す（＝結合）', async () => {
    const bytes = await makeTestPdf([101, 102])
    const source = await makeTestPdf([201, 202])

    const r = await addFromPdf({ bytes, pageIds: ['a', 'b'] }, source, null)

    expect(await pageWidths(r.bytes)).toEqual([101, 102, 201, 202])
    expect(r.pageIds.slice(0, 2)).toEqual(['a', 'b'])
    expect(r.pageIds).toHaveLength(4)
  })

  it('指定したページの前に入れる', async () => {
    const bytes = await makeTestPdf([101, 102])
    const source = await makeTestPdf([201, 202])

    const r = await addFromPdf({ bytes, pageIds: ['a', 'b'] }, source, 'b')

    expect(await pageWidths(r.bytes)).toEqual([101, 201, 202, 102])
    expect(r.pageIds[0]).toBe('a')
    expect(r.pageIds[3]).toBe('b')
  })

  it('先頭のページの前にも入れられる', async () => {
    const bytes = await makeTestPdf([101])
    const source = await makeTestPdf([201])

    const r = await addFromPdf({ bytes, pageIds: ['a'] }, source, 'a')

    expect(await pageWidths(r.bytes)).toEqual([201, 101])
    expect(r.pageIds[1]).toBe('a')
  })

  it('足したページには、今までと重ならない目印が付く', async () => {
    const bytes = await makeTestPdf([101])
    const source = await makeTestPdf([201, 202])

    const r = await addFromPdf({ bytes, pageIds: ['a'] }, source, null)

    expect(new Set(r.pageIds).size).toBe(r.pageIds.length)
    expect(r.pageIds.filter((id) => id === 'a')).toHaveLength(1)
  })

  it('足しただけなので、絵の描き直しは不要と申告する', async () => {
    const bytes = await makeTestPdf([101])
    const source = await makeTestPdf([201])

    const r = await addFromPdf({ bytes, pageIds: ['a'] }, source, null)
    expect(r.invalidated).toEqual([])
  })

  it('元に無いページIDを入れる位置に指定したら、日本語のお知らせで止まる', async () => {
    const bytes = await makeTestPdf([101])
    const source = await makeTestPdf([201])

    await expect(addFromPdf({ bytes, pageIds: ['a'] }, source, 'x')).rejects.toThrow('ページ')
  })

  // 「ページが0枚のPDF」は試験用の材料では作れない（pdf-lib が保存して読み直すと
  // 1ページのPDFになる）。壊れたファイルを選んだ場合の受け止めは addOp.ts 側に
  // 残してあるが、自動テストでは確かめられないのでここには書かない。
})

describe('addFromPdf（取り込み元から選んだページだけ足す）', () => {
  it('選んだページだけが入る', async () => {
    const bytes = await makeTestPdf([101])
    const source = await makeTestPdf([201, 202, 203])

    const r = await addFromPdf({ bytes, pageIds: ['a'] }, source, null, [0, 2])

    expect(await pageWidths(r.bytes)).toEqual([101, 201, 203])
    expect(r.pageIds).toHaveLength(3)
  })

  it('選んだ順ではなく、取り込み元の並び順で入る', async () => {
    const bytes = await makeTestPdf([101])
    const source = await makeTestPdf([201, 202, 203])

    const r = await addFromPdf({ bytes, pageIds: ['a'] }, source, null, [2, 0])

    expect(await pageWidths(r.bytes)).toEqual([101, 201, 203])
  })

  it('1ページも選んでいなければ、日本語のお知らせで止まる', async () => {
    const bytes = await makeTestPdf([101])
    const source = await makeTestPdf([201])

    await expect(addFromPdf({ bytes, pageIds: ['a'] }, source, null, [])).rejects.toThrow('ページ')
  })

  it('取り込み元に無いページ番号を指定したら、日本語のお知らせで止まる', async () => {
    const bytes = await makeTestPdf([101])
    const source = await makeTestPdf([201])

    await expect(
      addFromPdf({ bytes, pageIds: ['a'] }, source, null, [5])
    ).rejects.toThrow('取り込み元にないページ')
  })
})

describe('imagesToPdfBytes（画像をPDFにする）', () => {
  it('画像1枚から1ページのPDFができる', async () => {
    const out = await imagesToPdfBytes([png()])
    expect(await pageWidths(out)).toEqual([1])
  })

  it('画像を1枚も渡さなければ、日本語のお知らせで止まる', async () => {
    await expect(imagesToPdfBytes([])).rejects.toThrow('画像')
  })

  it('PNG・JPEG 以外は、どの画像かを示して断る', async () => {
    const notAnImage = { name: 'めも.webp', bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) }
    await expect(imagesToPdfBytes([notAnImage])).rejects.toThrow('めも.webp')
  })

  it('1枚20MBを超える画像は、ファイル名を示して処理前に止める', async () => {
    const tooLarge = new Uint8Array(20 * 1024 * 1024 + 1)
    tooLarge.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    await expect(imagesToPdfBytes([
      { name: '大きすぎる.png', bytes: tooLarge },
    ])).rejects.toThrow('大きすぎる.png')
  })

  it('一辺12000ピクセルを超える画像は、PDFへ埋め込む前に止める', async () => {
    const oversizedDimensions = makeTestPng()
    const view = new DataView(
      oversizedDimensions.buffer,
      oversizedDimensions.byteOffset,
      oversizedDimensions.byteLength,
    )
    view.setUint32(16, 12_001)

    await expect(imagesToPdfBytes([
      { name: '横長すぎる.png', bytes: oversizedDimensions },
    ])).rejects.toThrow('横長すぎる.png')
  })

  it('201枚以上は、パソコンが固まる前に止める', async () => {
    const many = Array.from({ length: 201 }, (_, index) => ({
      name: `${index + 1}.png`,
      bytes: makeTestPng(),
    }))

    await expect(imagesToPdfBytes(many)).rejects.toThrow('200枚')
  })
})

describe('画像を取り込み元として足す（画面と同じ道すじ）', () => {
  it('画像2枚をPDFに直してから足すと、2ページ増える', async () => {
    const bytes = await makeTestPdf([101])
    // 画面側（ImportSourcePicker）と同じ順序: 画像 → PDF → 取り込み元として足す
    const source = await imagesToPdfBytes([png(), png()])
    const r = await addFromPdf({ bytes, pageIds: ['a'] }, source, null)

    expect(r.pageIds).toHaveLength(3)
    expect(await pageWidths(r.bytes)).toEqual([101, 1, 1])
  })

  it('指定したページの前にも入れられる', async () => {
    const bytes = await makeTestPdf([101, 102])
    const source = await imagesToPdfBytes([png()])
    const r = await addFromPdf({ bytes, pageIds: ['a', 'b'] }, source, 'b')

    expect(await pageWidths(r.bytes)).toEqual([101, 1, 102])
  })
})
