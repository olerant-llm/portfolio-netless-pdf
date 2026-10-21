import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

import { createHistory, pushHistory, undoHistory } from '../src/document/historyStack'
import { rotatePages } from '../src/operations/pageOps'
import { makeTestPng } from './helpers/makePdf'

const RUN_LARGE_AUDIT = process.env.STAGE7_LARGE_PDF === '1'
const MEBIBYTE = 1024 * 1024

function elapsedSince(startedAt: number) {
  return performance.now() - startedAt
}

function makeDeterministicPayload(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  let state = 0x12345678
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    bytes[index] = state & 0xff
  }
  return bytes
}

async function makeLargePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const image = await pdf.embedPng(makeTestPng())

  for (let index = 0; index < 200; index += 1) {
    const page = pdf.addPage(index % 2 === 0 ? [595, 842] : [842, 595])
    page.drawText(`PERFORMANCE PAGE ${index + 1}`, {
      x: 36,
      y: page.getHeight() - 54,
      size: 14,
      font,
    })
    page.drawImage(image, { x: 36, y: 36, width: 40, height: 40 })
  }

  // 画像・文字を持つ200ページに、圧縮しにくい添付データを加えて約20MBにする。
  await pdf.attach(makeDeterministicPayload(19 * MEBIBYTE), 'load-data.bin', {
    mimeType: 'application/octet-stream',
    description: 'Stage 7 performance load',
  })
  return pdf.save({ useObjectStreams: false })
}

describe.skipIf(!RUN_LARGE_AUDIT)('第7段階：200ページ・約20MBの性能測定', () => {
  it('読み込み、回転、保存、元に戻すが上限内に収まる', async () => {
    const bytes = await makeLargePdf()
    expect(bytes.byteLength).toBeGreaterThan(18 * MEBIBYTE)
    expect(bytes.byteLength).toBeLessThan(30 * MEBIBYTE)

    const pageIds = Array.from({ length: 200 }, (_, index) => `page-${index + 1}`)
    const rssSamples = [process.memoryUsage().rss]

    const openStartedAt = performance.now()
    const opened = await PDFDocument.load(bytes, { updateMetadata: false })
    expect(opened.getPageCount()).toBe(200)
    // 最初の縮小表示へ進む前提として、1ページ目の内容まで読めることを確かめる。
    expect(opened.getPage(0).node.Contents()).toBeDefined()
    const openMilliseconds = elapsedSince(openStartedAt)
    rssSamples.push(process.memoryUsage().rss)

    const rotateStartedAt = performance.now()
    const rotated = await rotatePages({ bytes, pageIds }, ['page-1'], 90)
    const rotateMilliseconds = elapsedSince(rotateStartedAt)
    rssSamples.push(process.memoryUsage().rss)

    const saveStartedAt = performance.now()
    const reopened = await PDFDocument.load(rotated.bytes, { updateMetadata: false })
    const saved = await reopened.save({ useObjectStreams: false })
    const saveMilliseconds = elapsedSince(saveStartedAt)
    rssSamples.push(process.memoryUsage().rss)

    const history = pushHistory(createHistory(), { bytes, pageIds })
    const undone = undoHistory(history)
    expect(undone?.entry.bytes).toBe(bytes)
    expect(undone?.entry.pageIds).toBe(pageIds)
    rssSamples.push(process.memoryUsage().rss)

    const firstPage = await PDFDocument.load(saved).then((pdf) => pdf.getPage(0))
    expect(firstPage.getRotation().angle).toBe(90)
    expect(openMilliseconds).toBeLessThanOrEqual(5_000)
    expect(rotateMilliseconds).toBeLessThanOrEqual(3_000)
    expect(saveMilliseconds).toBeLessThanOrEqual(30_000)
    expect(Math.max(...rssSamples)).toBeLessThan(1.5 * 1024 * MEBIBYTE)

    console.info('STAGE7_PERFORMANCE', JSON.stringify({
      bytes: bytes.byteLength,
      openMilliseconds: Math.round(openMilliseconds),
      rotateMilliseconds: Math.round(rotateMilliseconds),
      saveMilliseconds: Math.round(saveMilliseconds),
      peakRssBytes: Math.max(...rssSamples),
    }))
  }, 120_000)
})
