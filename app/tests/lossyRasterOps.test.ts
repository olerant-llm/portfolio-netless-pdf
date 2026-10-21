import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, degrees } from 'pdf-lib'
import {
  COMPRESS_INFORMATION_LOSSES,
  compressFromRasterPages,
  compressionSettings,
  inspectCompressionCandidate,
} from '../src/operations/compressOp'
import { grayscaleFromRasterPages, GRAYSCALE_INFORMATION_LOSSES } from '../src/operations/grayscaleOp'
import {
  applyPreparedRasterCandidate,
  paperSizeFromRenderedViewport,
  rasterViewportOptions,
} from '../src/operations/lossyRasterOp'
import { detectDigitalSignature } from '../src/document/digitalSignature'
import { inspectFeatureRichPdf, makeFeatureRichPdf, makeTestPdf, makeTestPng } from './helpers/makePdf'

const pngPage = () => ({
  imageBytes: makeTestPng(),
  imageKind: 'png' as const,
  renderedRotation: 0 as const,
})

async function makePageGeometryPdf() {
  const doc = await PDFDocument.create()
  const portrait = doc.addPage([595.28, 841.89])
  portrait.setMediaBox(10, 20, 595.28, 841.89)
  portrait.setCropBox(30, 40, 500, 700)
  portrait.setBleedBox(31, 41, 498, 698)
  portrait.setTrimBox(32, 42, 496, 696)
  portrait.setArtBox(33, 43, 494, 694)
  portrait.setRotation(degrees(90))

  const landscape = doc.addPage([841.89, 595.28])
  landscape.setCropBox(5, 6, 800, 550)
  landscape.setRotation(degrees(270))
  doc.catalog.Pages().set(PDFName.of('UserUnit'), PDFNumber.of(2))
  return doc.save()
}

async function pageGeometry(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((page) => ({
    media: page.getMediaBox(),
    crop: page.getCropBox(),
    bleed: page.getBleedBox(),
    trim: page.getTrimBox(),
    art: page.getArtBox(),
    rotation: page.getRotation().angle,
    userUnit: doc.context.lookupMaybe(
      page.node.getInheritableAttribute(PDFName.of('UserUnit')),
      PDFNumber,
    )?.asNumber() ?? 1,
  }))
}

async function addSignatureStructure(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  const signature = doc.context.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'adbe.pkcs7.detached',
    ByteRange: [0, 100, 200, 300],
    Contents: PDFHexString.of('00112233'),
  })
  const field = doc.context.obj({
    FT: 'Sig',
    T: 'proof-signature',
    V: doc.context.register(signature),
  })
  const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict)
  acroForm.lookup(PDFName.of('Fields'), PDFArray).push(doc.context.register(field))
  return doc.save()
}

describe('grayscaleFromRasterPages（白黒化の組み立て実証）', () => {
  it('画像の細かさとは別に、元の紙面寸法と向きを保つ', async () => {
    const bytes = await makePageGeometryPdf()
    const input = {
      bytes,
      pageIds: ['portrait', 'landscape'],
    }
    const result = await grayscaleFromRasterPages(input, [pngPage(), pngPage()])

    expect(await pageGeometry(result.bytes)).toEqual(await pageGeometry(bytes))
    expect(result.pageIds).toEqual(input.pageIds)
    expect(result.invalidated).toEqual(input.pageIds)
  })

  it('描画倍率を紙面寸法へ持ち込まない', () => {
    expect(rasterViewportOptions(2)).toEqual({ scale: 2, rotation: 0 })
    expect(paperSizeFromRenderedViewport(1_190.56, 1_683.78, 2)).toEqual({
      width: 595.28,
      height: 841.89,
    })
  })

  it('画像への焼き直しで失う情報を、警告用の一覧と実際の出力で確認する', async () => {
    const signedBytes = await addSignatureStructure(await makeFeatureRichPdf())
    const input = { bytes: signedBytes, pageIds: ['a', 'b', 'c'] }
    const result = await grayscaleFromRasterPages(input, [
      pngPage(), pngPage(), pngPage(),
    ])
    const summary = await inspectFeatureRichPdf(result.bytes)
    const output = await PDFDocument.load(result.bytes)
    const firstResources = output.getPages()[0].node.Resources()

    expect(GRAYSCALE_INFORMATION_LOSSES).toEqual([
      '文字検索・コピー', '内部リンク', '外部リンク', '入力欄', '注釈',
      'しおり', '文書情報', '添付ファイル', 'ページラベル', '電子署名',
    ])
    expect(await detectDigitalSignature(input.bytes)).toBe('signed')
    expect(await detectDigitalSignature(result.bytes)).toBe('none')
    expect(summary.title).toBeUndefined()
    expect(summary.outlineTargets).toEqual([])
    expect(summary.internalLinkTargets).toEqual([])
    expect(summary.externalLinks).toEqual([])
    expect(summary.noteCount).toBe(0)
    expect(summary.fieldNames).toEqual([])
    expect(summary.hasAttachment).toBe(false)
    expect(summary.pageLabels).toEqual([])
    expect(firstResources?.lookupMaybe(PDFName.Font, PDFDict)?.keys()).toEqual([])
    expect(result.bytes.length).toBeLessThan(input.bytes.length)
  })

  it('ページ画像の数が合わなければ、日本語の理由で止まる', async () => {
    const input = { bytes: await makeTestPdf([100, 200]), pageIds: ['a', 'b'] }

    await expect(grayscaleFromRasterPages(input, [pngPage()]))
      .rejects.toThrow('ページ数')
  })
})

describe('applyPreparedRasterCandidate（確認済み候補の反映）', () => {
  const candidate = {
    sourceBytes: new Uint8Array([1, 2, 3]),
    sourcePageIds: ['a', 'b'],
    result: {
      bytes: new Uint8Array([4, 5, 6]),
      pageIds: ['a', 'b'],
      invalidated: ['a', 'b'],
    },
  }

  it('見本を作った元PDFと同じ場合だけ、複製した結果を返す', () => {
    const result = applyPreparedRasterCandidate(
      { bytes: new Uint8Array([1, 2, 3]), pageIds: ['a', 'b'] },
      candidate,
    )

    expect(result).toEqual(candidate.result)
    expect(result.bytes).not.toBe(candidate.result.bytes)
    expect(result.pageIds).not.toBe(candidate.result.pageIds)
  })

  it('確認中にPDFの中身やページ順が変わっていれば反映しない', () => {
    expect(() => applyPreparedRasterCandidate(
      { bytes: new Uint8Array([1, 2, 9]), pageIds: ['a', 'b'] },
      candidate,
    )).toThrow('確認中にPDFが変わった')
    expect(() => applyPreparedRasterCandidate(
      { bytes: new Uint8Array([1, 2, 3]), pageIds: ['b', 'a'] },
      candidate,
    )).toThrow('確認中にPDFが変わった')
  })
})

describe('compressFromRasterPages（軽量化の組み立て実証）', () => {
  it('高画質ほど画像を細かくし、JPEG品質も高くする', () => {
    expect(compressionSettings.high.renderScale).toBeGreaterThan(compressionSettings.medium.renderScale)
    expect(compressionSettings.medium.renderScale).toBeGreaterThan(compressionSettings.low.renderScale)
    expect(compressionSettings.high.jpegQuality).toBeGreaterThan(compressionSettings.medium.jpegQuality)
    expect(compressionSettings.medium.jpegQuality).toBeGreaterThan(compressionSettings.low.jpegQuality)
  })

  it('白黒化と同じく、画像への焼き直しで失う情報を事前に示す', () => {
    expect(COMPRESS_INFORMATION_LOSSES).toEqual(GRAYSCALE_INFORMATION_LOSSES)
  })

  it('全ページを描き直し対象にし、ページの目印は変えない', async () => {
    const input = { bytes: await makeTestPdf([100, 200]), pageIds: ['a', 'b'] }
    const result = await compressFromRasterPages(input, [pngPage(), pngPage()])

    expect(result.pageIds).toEqual(['a', 'b'])
    expect(result.invalidated).toEqual(['a', 'b'])
  })

  it('元より小さい場合だけ、編集中のPDFを置き換えてよいと判定する', () => {
    expect(inspectCompressionCandidate(1_000, 700)).toEqual({
      canReplace: true,
      originalSize: 1_000,
      resultSize: 700,
      savedBytes: 300,
      reductionPercent: 30,
    })
    expect(inspectCompressionCandidate(1_000, 1_000).canReplace).toBe(false)
    expect(inspectCompressionCandidate(1_000, 1_200).canReplace).toBe(false)
  })
})
