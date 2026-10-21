import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { exportPdfPagesAsImages } from '../src/exports/pdfToImages'

afterEach(() => vi.unstubAllGlobals())

function fakeCanvasEnvironment() {
  const rendered: number[] = []
  const encoded: Array<{ type: string, quality?: number }> = []
  let activePage = 0
  const context = {
    fillStyle: '',
    fillRect: vi.fn(),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: (blob: Blob) => void, type: string, quality?: number) => {
      encoded.push({ type, quality })
      callback(new Blob([new Uint8Array([activePage])], { type }))
    }),
  }
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
  const pdfDoc = {
    numPages: 3,
    getPage: vi.fn(async (pageNumber: number) => ({
      getViewport: () => ({ width: 100, height: 200 }),
      render: () => ({
        promise: Promise.resolve().then(() => {
          activePage = pageNumber
          rendered.push(pageNumber)
        }),
      }),
    })),
  }
  return { canvas, encoded, pdfDoc, rendered }
}

describe('exportPdfPagesAsImages（PDFページを画像で書き出す）', () => {
  it('選択ページだけを文書順にJPEG化し、進み具合を返す', async () => {
    const { canvas, encoded, pdfDoc, rendered } = fakeCanvasEnvironment()
    const progress: number[] = []
    const result = await exportPdfPagesAsImages(
      pdfDoc,
      ['a', 'b', 'c'],
      ['c', 'a'],
      { format: 'jpg', scale: 2, sourceName: '確認用' },
      (value) => progress.push(value.percent),
    )
    const zip = await JSZip.loadAsync(result.bytes)

    expect(Object.keys(zip.files)).toEqual(['確認用-ページ001.jpg', '確認用-ページ003.jpg'])
    expect(rendered).toEqual([1, 3])
    expect(progress).toEqual([50, 100])
    expect(encoded).toEqual([
      { type: 'image/jpeg', quality: 0.9 },
      { type: 'image/jpeg', quality: 0.9 },
    ])
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  it('PNGでは全ページを順に書き出す', async () => {
    const { encoded, pdfDoc } = fakeCanvasEnvironment()
    const result = await exportPdfPagesAsImages(
      pdfDoc,
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      { format: 'png', scale: 1.5, sourceName: '確認用' },
    )

    expect(result.pageCount).toBe(3)
    expect(result.fileName).toBe('確認用-ページ画像.zip')
    expect(encoded.every((entry) => entry.type === 'image/png' && entry.quality === undefined)).toBe(true)
  })

  it('選択なし、存在しないページ、巨大な紙面は日本語で止める', async () => {
    const { pdfDoc } = fakeCanvasEnvironment()
    await expect(exportPdfPagesAsImages(
      pdfDoc, ['a', 'b', 'c'], [], { format: 'jpg', scale: 2, sourceName: '確認用' },
    )).rejects.toThrow('選択')
    await expect(exportPdfPagesAsImages(
      pdfDoc, ['a', 'b', 'c'], ['x'], { format: 'jpg', scale: 2, sourceName: '確認用' },
    )).rejects.toThrow('見つかりません')

    pdfDoc.getPage = vi.fn(async () => ({
      getViewport: () => ({ width: 20_000, height: 20_000 }),
      render: vi.fn(),
    }))
    await expect(exportPdfPagesAsImages(
      pdfDoc, ['a', 'b', 'c'], ['a'], { format: 'jpg', scale: 2, sourceName: '確認用' },
    )).rejects.toThrow('大きすぎる')
  })
})
