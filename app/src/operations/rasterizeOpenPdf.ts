/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { RasterizedPdfPage, rasterViewportOptions } from './lossyRasterOp'
import { OperationError } from './types'

export interface OpenPdfRasterSettings {
  renderScale: number
  jpegQuality: number
  grayscale: boolean
}

export interface RasterProgress {
  completedPages: number
  totalPages: number
  percent: number
}

const MAX_CANVAS_DIMENSION = 16_384
const MAX_CANVAS_PIXELS = 40_000_000

/** 赤・緑・青の見え方の違いを加味し、各画素を灰色へ変える。 */
export function applyGrayscaleToPixels(pixels: Uint8ClampedArray) {
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const gray = pixels[index] * 0.299
      + pixels[index + 1] * 0.587
      + pixels[index + 2] * 0.114
    pixels[index] = gray
    pixels[index + 1] = gray
    pixels[index + 2] = gray
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob || blob.size === 0) {
        reject(new OperationError('ページ画像を作れないため、処理を中止しました。'))
        return
      }
      try {
        resolve(new Uint8Array(await blob.arrayBuffer()))
      } catch {
        reject(new OperationError('ページ画像を読み取れないため、処理を中止しました。'))
      }
    }, 'image/jpeg', quality)
  })
}

/**
 * 表示用に開いているPDFを、1ページずつJPEGへ変換する。
 * 大きな生画像を同時に持たず、各ページの描画後にCanvasを解放する。
 */
export async function rasterizeOpenPdfPages(
  pdfDoc: any,
  settings: OpenPdfRasterSettings,
  onProgress: (progress: RasterProgress) => void = () => undefined,
): Promise<RasterizedPdfPage[]> {
  rasterViewportOptions(settings.renderScale)
  if (!Number.isFinite(settings.jpegQuality) || settings.jpegQuality <= 0 || settings.jpegQuality > 1) {
    throw new OperationError('画像の品質設定が正しくないため、処理を中止しました。')
  }
  const totalPages = Number(pdfDoc?.numPages)
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new OperationError('PDFのページを確認できないため、処理を中止しました。')
  }

  const result: RasterizedPdfPage[] = []
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const canvas = document.createElement('canvas')
    try {
      const page = await pdfDoc.getPage(pageNumber)
      const viewport = page.getViewport(rasterViewportOptions(settings.renderScale))
      const width = Math.ceil(viewport.width)
      const height = Math.ceil(viewport.height)
      if (
        !Number.isFinite(width) || !Number.isFinite(height)
        || width < 1 || height < 1
        || width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION
        || width * height > MAX_CANVAS_PIXELS
      ) {
        throw new OperationError(`${pageNumber}ページ目の画像が大きすぎるため、処理を中止しました。`)
      }

      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) {
        throw new OperationError('ページ画像を作れないため、処理を中止しました。')
      }
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      await page.render({ canvasContext: context, viewport, intent: 'print' }).promise

      if (settings.grayscale) {
        const imageData = context.getImageData(0, 0, width, height)
        applyGrayscaleToPixels(imageData.data)
        context.putImageData(imageData, 0, 0)
      }

      result.push({
        imageBytes: await canvasToJpeg(canvas, settings.jpegQuality),
        imageKind: 'jpg',
        renderedRotation: 0,
      })
    } catch (error) {
      if (error instanceof OperationError) throw error
      throw new OperationError(`${pageNumber}ページ目の画像を作れないため、処理を中止しました。`)
    } finally {
      canvas.width = 0
      canvas.height = 0
    }

    onProgress({
      completedPages: pageNumber,
      totalPages,
      percent: Math.round((pageNumber / totalPages) * 100),
    })
    // 描画の合間に画面更新を通し、大量ページでも窓が固まり続けないようにする。
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  return result
}
