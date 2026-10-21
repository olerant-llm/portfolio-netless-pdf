import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { makeTestPdf } from './helpers/makePdf'
import { protectPdfBytes } from '../src/security/pdfProtection'
import { repairPdfBytes } from '../src/operations/repairPdf'

function breakStartXref(bytes: Uint8Array) {
  const text = new TextDecoder('latin1').decode(bytes)
  const marker = text.lastIndexOf('startxref')
  if (marker < 0) throw new Error('試験用PDFにstartxrefがありません')
  const tail = text.slice(marker)
  const number = tail.match(/startxref\s+(\d+)/)
  if (!number?.[1] || number.index === undefined) throw new Error('試験用PDFの参照位置が見つかりません')

  const broken = bytes.slice()
  const numberStart = marker + number.index + number[0].lastIndexOf(number[1])
  broken.fill(0x30, numberStart, numberStart + number[1].length)
  return broken
}

describe('repairPdfBytes（開けないPDFの修復）', () => {
  it('参照位置が壊れたPDFを組み直し、開けるデータを返す', async () => {
    const original = await makeTestPdf([101, 102])
    const repaired = await repairPdfBytes(breakStartXref(original))

    expect((await PDFDocument.load(repaired)).getPageCount()).toBe(2)
  })

  it('PDFではないデータは、修復済みとして返さない', async () => {
    await expect(repairPdfBytes(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow('修復')
  })

  it('パスワード付きPDFを、壊れたPDFとして無理に組み直さない', async () => {
    const protectedBytes = await protectPdfBytes(await makeTestPdf([101]), 'ひみつ')

    await expect(repairPdfBytes(protectedBytes)).rejects.toThrow('パスワード')
  })
})
