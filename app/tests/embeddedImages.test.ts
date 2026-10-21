import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { exportEmbeddedImages } from '../src/exports/embeddedImages'

afterEach(() => vi.unstubAllGlobals())

function installCanvas() {
  const pixels: number[][] = []
  const context = {
    createImageData: vi.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    })),
    putImageData: vi.fn((image: { data: Uint8ClampedArray }) => pixels.push([...image.data])),
    drawImage: vi.fn(),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: (blob: Blob) => void) => {
      callback(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
    }),
  }
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
  return { canvas, pixels }
}

describe('exportEmbeddedImages（埋め込み画像の取り出し）', () => {
  it('画像部品をPNGへ変換し、同じ部品の重複呼び出しは1枚にまとめる', async () => {
    const { canvas, pixels } = installCanvas()
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 40]) }
    const page = {
      getOperatorList: vi.fn(async () => ({
        fnArray: [85, 85],
        argsArray: [['img_1'], ['img_1']],
      })),
      objs: { get: vi.fn((_name: string, callback: (value: unknown) => void) => callback(image)) },
    }
    const progress: number[] = []
    const result = await exportEmbeddedImages(
      { numPages: 1, getPage: vi.fn(async () => page) },
      '確認用',
      (value) => progress.push(value.percent),
    )
    const zip = await JSZip.loadAsync(result.bytes)

    expect(Object.keys(zip.files)).toEqual(['確認用-画像001.png'])
    expect(result.imageCount).toBe(1)
    expect(pixels).toEqual([[10, 20, 30, 40]])
    expect(progress).toEqual([100])
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  it('RGB3色の画像へ不透明度を足してPNGにする', async () => {
    const { pixels } = installCanvas()
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30]) }
    const page = {
      getOperatorList: vi.fn(async () => ({ fnArray: [85], argsArray: [['img_1']] })),
      objs: { get: vi.fn((_name: string, callback: (value: unknown) => void) => callback(image)) },
    }
    await exportEmbeddedImages({ numPages: 1, getPage: vi.fn(async () => page) }, '確認用')
    expect(pixels).toEqual([[10, 20, 30, 255]])
  })

  it('PDF.jsが準備中に返すnullを完成画像と取り違えない', async () => {
    installCanvas()
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) }
    const page = {
      getOperatorList: vi.fn(async () => ({ fnArray: [85], argsArray: [['img_1']] })),
      objs: {
        get: vi.fn((_name: string, callback: (value: unknown) => void) => {
          queueMicrotask(() => callback(image))
          return null
        }),
      },
    }

    const result = await exportEmbeddedImages(
      { numPages: 1, getPage: vi.fn(async () => page) },
      '確認用',
    )

    expect(result.imageCount).toBe(1)
  })

  it('PDF.jsの内部接頭辞が付いた画像名も見落とさない', async () => {
    installCanvas()
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) }
    const commonObjects = {
      get: vi.fn((_name: string, callback: (value: unknown) => void) => callback(image)),
    }
    const page = {
      getOperatorList: vi.fn(async () => ({
        fnArray: [85],
        argsArray: [['g_d0_img_p1_1']],
      })),
      objs: { get: vi.fn(() => { throw new Error('ページ内画像の保管場所を使っています。') }) },
      commonObjs: commonObjects,
    }

    const result = await exportEmbeddedImages(
      { numPages: 1, getPage: vi.fn(async () => page) },
      '確認用',
    )

    expect(result.imageCount).toBe(1)
    expect(commonObjects.get).toHaveBeenCalledWith('g_d0_img_p1_1', expect.any(Function))
    expect(page.objs.get).not.toHaveBeenCalled()
  })

  it('PDF.jsが画像として読み込んだ部品もCanvasへ描いて保存する', async () => {
    const { canvas } = installCanvas()
    const bitmap = { width: 1, height: 1 }
    const image = { width: 1, height: 1, bitmap }
    const page = {
      getOperatorList: vi.fn(async () => ({ fnArray: [85], argsArray: [['img_1']] })),
      objs: { get: vi.fn((_name: string, callback: (value: unknown) => void) => callback(image)) },
    }
    await exportEmbeddedImages({ numPages: 1, getPage: vi.fn(async () => page) }, '確認用')
    expect(canvas.getContext().drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1, 1)
  })

  it('画像がないPDFと巨大画像は日本語で止める', async () => {
    installCanvas()
    const noImagePage = {
      getOperatorList: vi.fn(async () => ({ fnArray: [], argsArray: [] })),
      objs: { get: vi.fn() },
    }
    await expect(exportEmbeddedImages(
      { numPages: 1, getPage: vi.fn(async () => noImagePage) }, '確認用',
    )).rejects.toThrow('見つかりません')

    const huge = { width: 20_000, height: 20_000, data: new Uint8ClampedArray() }
    const hugePage = {
      getOperatorList: vi.fn(async () => ({ fnArray: [85], argsArray: [['img_1']] })),
      objs: { get: vi.fn((_name: string, callback: (value: unknown) => void) => callback(huge)) },
    }
    await expect(exportEmbeddedImages(
      { numPages: 1, getPage: vi.fn(async () => hugePage) }, '確認用',
    )).rejects.toThrow('大きすぎる')
  })
})
