import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { makeTestPdf } from './helpers/makePdf'

const { loadPdfFromBytesMock } = vi.hoisted(() => ({
  loadPdfFromBytesMock: vi.fn(),
}))

vi.mock('../src/utils/pdfHelpers', () => ({
  loadPdfFromBytes: loadPdfFromBytesMock,
}))

beforeEach(() => {
  loadPdfFromBytesMock.mockReset()
  loadPdfFromBytesMock.mockImplementation(async (bytes: Uint8Array) => {
    const doc = await PDFDocument.load(bytes)
    return { numPages: doc.getPageCount(), destroy: vi.fn() }
  })
})

async function loadSessionModule() {
  return await import('../src/document/documentSession')
}

describe('prepareOperationResult（操作結果を反映する前の確認）', () => {
  it('操作へ複製を渡し、元のPDFデータとページIDを変更させない', async () => {
    const bytes = await makeTestPdf([101])
    const originalBytes = bytes.slice()
    const pageIds = ['a']
    const { prepareOperationResult, releasePdf } = await loadSessionModule()

    const prepared = await prepareOperationResult({ bytes, pageIds }, async (input) => {
      input.bytes.fill(0)
      input.pageIds[0] = 'changed-inside-operation'
      return {
        bytes: await makeTestPdf([201, 202]),
        pageIds: ['b', 'c'],
        invalidated: [],
      }
    })

    expect(bytes).toEqual(originalBytes)
    expect(pageIds).toEqual(['a'])
    expect(prepared.pdfDoc.numPages).toBe(2)
    releasePdf(prepared.pdfDoc)
  })

  it('壊れた結果は反映準備に入れず、元のPDFデータを保つ', async () => {
    const bytes = await makeTestPdf([101])
    const originalBytes = bytes.slice()
    const pageIds = ['a']
    const { prepareOperationResult } = await loadSessionModule()

    await expect(prepareOperationResult({ bytes, pageIds }, async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      pageIds: ['broken'],
      invalidated: [],
    }))).rejects.toThrow()

    expect(bytes).toEqual(originalBytes)
    expect(pageIds).toEqual(['a'])
  })

  it('PDFのページ数とページID数が違う結果を拒否する', async () => {
    const bytes = await makeTestPdf([101])
    const { prepareOperationResult } = await loadSessionModule()

    await expect(prepareOperationResult({ bytes, pageIds: ['a'] }, async () => ({
      bytes: await makeTestPdf([201, 202]),
      pageIds: ['b'],
      invalidated: [],
    }))).rejects.toThrow('ページ')
  })

  it('同じページIDが重複する結果を拒否する', async () => {
    const bytes = await makeTestPdf([101])
    const { prepareOperationResult } = await loadSessionModule()

    await expect(prepareOperationResult({ bytes, pageIds: ['a'] }, async () => ({
      bytes: await makeTestPdf([201, 202]),
      pageIds: ['same', 'same'],
      invalidated: [],
    }))).rejects.toThrow('ページ')
  })

  it('前の結果を次の操作へ渡しても、PDFデータが空にならず連続操作できる', async () => {
    const { prepareOperationResult, releasePdf } = await loadSessionModule()
    let current = { bytes: await makeTestPdf([101]), pageIds: ['a'] }

    for (const [width, pageId] of [[201, 'b'], [301, 'c']] as const) {
      const prepared = await prepareOperationResult(current, async (input) => {
        expect(input.bytes.byteLength).toBeGreaterThan(0)
        return {
          bytes: await makeTestPdf([width]),
          pageIds: [pageId],
          invalidated: [],
        }
      })
      current = prepared.result
      releasePdf(prepared.pdfDoc)
    }

    expect(current.bytes.byteLength).toBeGreaterThan(0)
    expect(current.pageIds).toEqual(['c'])
  })
})

describe('PDFを開いた直後の保護確認', () => {
  it('権限情報を読めなかった場合は、開きかけのPDFを解放する', async () => {
    const pdfDoc = {
      getPermissions: vi.fn().mockRejectedValue(new Error('permissions failed')),
      destroy: vi.fn(),
    }
    const { detectPdfEditingProtectionSafely } = await loadSessionModule()

    await expect(detectPdfEditingProtectionSafely(pdfDoc)).rejects.toThrow('permissions failed')
    expect(pdfDoc.destroy).toHaveBeenCalledOnce()
  })
})
