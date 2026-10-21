/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import JSZip from 'jszip'

import { OperationError } from '../operations/types'
import { ExportProgress } from './exportProgress'
import { safeExportBaseName } from './fileNames'

export type PageImageFormat = 'png' | 'jpg'

export interface PdfToImagesOptions {
  format: PageImageFormat
  scale: number
  sourceName: string
}

export interface PdfImagesExportResult {
  bytes: Uint8Array
  fileName: string
  mimeType: 'application/zip'
  pageCount: number
}

const MAX_CANVAS_DIMENSION = 16_384
const MAX_CANVAS_PIXELS = 40_000_000

function imageBlob(canvas: HTMLCanvasElement, format: PageImageFormat): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const done = (blob: Blob | null) => {
      if (blob?.size) resolve(blob)
      else reject(new OperationError('ページ画像を作れないため、書き出しを中止しました。'))
    }
    if (format === 'png') canvas.toBlob(done, 'image/png')
    else canvas.toBlob(done, 'image/jpeg', 0.9)
  })
}

function orderedPageNumbers(pageIds: string[], targets: string[]): number[] {
  if (targets.length === 0) {
    throw new OperationError('画像にするページが選択されていません。')
  }
  const chosen = new Set(targets)
  if (chosen.size !== targets.length || targets.some((id) => !pageIds.includes(id))) {
    throw new OperationError('選択したページが見つかりません。もう一度選び直してください。')
  }
  return pageIds
    .map((id, index) => (chosen.has(id) ? index + 1 : -1))
    .filter((pageNumber) => pageNumber >= 1)
}

/** PDFの表示どおりの向きで、指定ページを1枚ずつ画像化してZIPへまとめる。 */
export async function exportPdfPagesAsImages(
  pdfDoc: any,
  pageIds: string[],
  targets: string[],
  options: PdfToImagesOptions,
  onProgress: (progress: ExportProgress) => void = () => undefined,
): Promise<PdfImagesExportResult> {
  if (!Number.isFinite(options.scale) || options.scale <= 0) {
    throw new OperationError('画像の細かさの設定が正しくありません。')
  }
  if (Number(pdfDoc?.numPages) !== pageIds.length) {
    throw new OperationError('PDFのページ情報が一致しないため、書き出しを中止しました。')
  }
  const pageNumbers = orderedPageNumbers(pageIds, targets)
  const totalPages = pageNumbers.length
  const digits = Math.max(3, String(pageIds.length).length)
  const extension = options.format
  const baseName = safeExportBaseName(options.sourceName)
  const zip = new JSZip()

  for (let offset = 0; offset < pageNumbers.length; offset += 1) {
    const pageNumber = pageNumbers[offset]
    const canvas = document.createElement('canvas')
    try {
      const page = await pdfDoc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: options.scale })
      const width = Math.ceil(viewport.width)
      const height = Math.ceil(viewport.height)
      if (
        !Number.isFinite(width) || !Number.isFinite(height)
        || width < 1 || height < 1
        || width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION
        || width * height > MAX_CANVAS_PIXELS
      ) {
        throw new OperationError(`${pageNumber}ページ目の画像が大きすぎるため、書き出しを中止しました。`)
      }

      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new OperationError('ページ画像を作れないため、書き出しを中止しました。')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      await page.render({ canvasContext: context, viewport, intent: 'print' }).promise
      const blob = await imageBlob(canvas, options.format)
      const numbered = String(pageNumber).padStart(digits, '0')
      zip.file(`${baseName}-ページ${numbered}.${extension}`, await blob.arrayBuffer())
    } catch (error) {
      if (error instanceof OperationError) throw error
      throw new OperationError(`${pageNumber}ページ目を画像にできないため、書き出しを中止しました。`)
    } finally {
      canvas.width = 0
      canvas.height = 0
    }

    onProgress({
      completedPages: offset + 1,
      totalPages,
      percent: Math.round(((offset + 1) / totalPages) * 100),
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  return {
    bytes: await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }),
    fileName: `${baseName}-ページ画像.zip`,
    mimeType: 'application/zip',
    pageCount: totalPages,
  }
}
