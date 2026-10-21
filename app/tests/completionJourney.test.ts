import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

import { cropOperation } from '../src/operations/cropOp'
import { updateMetadataOperation } from '../src/operations/metadataOp'
import { pageNumberOperation } from '../src/operations/pageNumberOp'
import { reorderPages, rotatePages } from '../src/operations/pageOps'
import { signatureOperation } from '../src/operations/signatureOp'
import { watermarkOperation } from '../src/operations/watermarkOp'
import {
  inspectFeatureRichPdf,
  makeFeatureRichPdf,
  makeTestPng,
} from './helpers/makePdf'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function makeEightPageFeatureRichPdf() {
  const pdf = await PDFDocument.load(await makeFeatureRichPdf())
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const image = await pdf.embedPng(makeTestPng())
  for (let index = 3; index < 8; index += 1) {
    const page = pdf.addPage(index % 2 === 0 ? [420, 595] : [595, 420])
    page.drawText(`PAGE-${index + 1}`, { x: 24, y: page.getHeight() - 40, size: 12, font })
    page.drawImage(image, { x: 24, y: 24, width: 12, height: 12 })
  }
  return pdf.save()
}

describe('完成確認：同じPDFを開いたまま続けて編集する', () => {
  it('7種類の編集後も、しおり・リンク・注釈・入力欄・添付ファイルを保つ', async () => {
    const fontBytes = await readFile(
      new URL('../public/fonts/NotoSansJP-Regular.otf', import.meta.url),
    )
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => fontBytes.buffer.slice(
        fontBytes.byteOffset,
        fontBytes.byteOffset + fontBytes.byteLength,
      ),
    })))

    let current = {
      bytes: await makeEightPageFeatureRichPdf(),
      pageIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    }

    current = await rotatePages(current, ['a'], 90)
    current = await reorderPages(current, ['c', 'a', 'b', 'd', 'e', 'f', 'g', 'h'])
    current = await cropOperation(current, ['a'], {
      left: 1,
      right: 1,
      top: 1,
      bottom: 1,
    })
    current = await watermarkOperation(current, {
      text: '確認用',
      color: '#CC0000',
      opacity: 0.2,
      fontSize: 24,
      rotation: -30,
    })
    current = await pageNumberOperation(current, {
      format: '{n}/{total}',
      startNumber: 1,
      position: 'bottom-center',
      color: '#000000',
      fontSize: 10,
    })
    current = await signatureOperation(current, {
      pageId: 'a',
      imageBytes: makeTestPng(),
      placement: { left: 0.7, top: 0.75, width: 0.2 },
    })
    current = await updateMetadataOperation(current, {
      title: '完成確認済み',
      author: 'ネットレスPDF',
      subject: '通し試験',
      keywords: 'PDF,確認',
      creator: 'ネットレスPDF',
      producer: 'ネットレスPDF',
    })

    const summary = await inspectFeatureRichPdf(current.bytes)

    expect(current.pageIds).toEqual(['c', 'a', 'b', 'd', 'e', 'f', 'g', 'h'])
    expect(summary.title).toBe('完成確認済み')
    expect(summary.outlineEntries).toHaveLength(2)
    expect(summary.danglingOutlineCount).toBe(0)
    expect(summary.internalLinkTargets).toHaveLength(3)
    expect(summary.danglingInternalLinkCount).toBe(0)
    expect(summary.externalLinks).toEqual(['https://example.test/'])
    expect(summary.noteCount).toBe(1)
    expect(summary.fieldNames).toEqual([
      'kept-field',
      'multi-page-field',
      'page-b-field',
    ])
    expect(summary.hasAttachment).toBe(true)
    expect(summary.namedDestinationNames).toEqual(['named-page-c'])
    expect(summary.pageLabels).toEqual(['C', 'A', 'B', 'C', 'C', 'C', 'C', 'C'])
  })
})
