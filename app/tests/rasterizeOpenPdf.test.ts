import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applyGrayscaleToPixels,
  rasterizeOpenPdfPages,
} from '../src/operations/rasterizeOpenPdf'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('rasterizeOpenPdfPages（開いているPDFを1ページずつ画像にする）', () => {
  it('色の見え方に合わせた明るさで白黒へ変換し、透明度は変えない', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 123,
      0, 255, 0, 234,
      0, 0, 255, 255,
    ])

    applyGrayscaleToPixels(pixels)

    expect([...pixels]).toEqual([
      76, 76, 76, 123,
      150, 150, 150, 234,
      29, 29, 29, 255,
    ])
  })

  it('回転を画像へ二重に入れず、1ページずつJPEG化して進み具合を返す', async () => {
    const getViewport = vi.fn(() => ({ width: 20, height: 10 }))
    const render = vi.fn(() => ({ promise: Promise.resolve() }))
    const pdfDoc = {
      numPages: 2,
      getPage: vi.fn(async () => ({ getViewport, render })),
    }
    const imageData = { data: new Uint8ClampedArray([10, 20, 30, 255]) }
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      getImageData: vi.fn(() => imageData),
      putImageData: vi.fn(),
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((done: (blob: Blob | null) => void) => {
        done(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }))
      }),
    }
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
    const progress: number[] = []

    const pages = await rasterizeOpenPdfPages(
      pdfDoc,
      { renderScale: 1.5, jpegQuality: 0.75, grayscale: true },
      (value) => progress.push(value.percent),
    )

    expect(getViewport).toHaveBeenCalledWith({ scale: 1.5, rotation: 0 })
    expect(context.putImageData).toHaveBeenCalledTimes(2)
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.75)
    expect(pages).toHaveLength(2)
    expect(pages.every((page) => page.imageKind === 'jpg' && page.renderedRotation === 0)).toBe(true)
    expect(progress).toEqual([50, 100])
  })

  it('ページ画像を作れない場合は、そのページだけ飛ばさず日本語で止める', async () => {
    const pdfDoc = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getViewport: () => ({ width: 20, height: 10 }),
        render: () => ({ promise: Promise.resolve() }),
      })),
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ fillStyle: '', fillRect: vi.fn() }),
      toBlob: (done: (blob: Blob | null) => void) => done(null),
    }
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })

    await expect(rasterizeOpenPdfPages(
      pdfDoc,
      { renderScale: 1, jpegQuality: 0.5, grayscale: false },
    )).rejects.toThrow('ページ画像')
  })
})
