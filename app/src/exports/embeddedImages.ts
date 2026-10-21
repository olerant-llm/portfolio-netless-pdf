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

export interface EmbeddedImagesResult {
  bytes: Uint8Array
  fileName: string
  mimeType: 'application/zip'
  imageCount: number
}

const MAX_IMAGE_DIMENSION = 12_000
const MAX_IMAGE_PIXELS = 40_000_000
const MAX_TOTAL_PIXELS = 200_000_000
const MAX_IMAGE_COUNT = 5_000

function getPdfObject(objects: any, name: string): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const returned = objects.get(name, (value: unknown) => resolve(value))
      if (returned !== undefined && returned !== null) resolve(returned)
    } catch (error) {
      reject(error)
    }
  })
}

function imageDimensions(image: any): { width: number, height: number, pixels: number } {
  const width = Number(image?.width)
  const height = Number(image?.height)
  const pixels = width * height
  if (
    !Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1
    || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION
    || pixels > MAX_IMAGE_PIXELS
  ) {
    throw new OperationError('埋め込み画像が大きすぎるため、取り出しを中止しました。')
  }
  return { width, height, pixels }
}

function imageBytesToRgba(image: any, pixels: number): Uint8ClampedArray {
  const source = image?.data
  if (!(source instanceof Uint8Array) && !(source instanceof Uint8ClampedArray)) {
    throw new OperationError('対応できない埋め込み画像があるため、取り出しを中止しました。')
  }

  if (source.length === pixels * 4) return new Uint8ClampedArray(source)
  const rgba = new Uint8ClampedArray(pixels * 4)
  if (source.length === pixels * 3) {
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      rgba[pixel * 4] = source[pixel * 3]
      rgba[pixel * 4 + 1] = source[pixel * 3 + 1]
      rgba[pixel * 4 + 2] = source[pixel * 3 + 2]
      rgba[pixel * 4 + 3] = 255
    }
    return rgba
  }
  if (source.length === pixels) {
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const gray = source[pixel]
      rgba[pixel * 4] = gray
      rgba[pixel * 4 + 1] = gray
      rgba[pixel * 4 + 2] = gray
      rgba[pixel * 4 + 3] = 255
    }
    return rgba
  }
  if (source.length === Math.ceil(pixels / 8)) {
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const gray = (source[Math.floor(pixel / 8)] & (128 >> (pixel % 8))) ? 255 : 0
      rgba[pixel * 4] = gray
      rgba[pixel * 4 + 1] = gray
      rgba[pixel * 4 + 2] = gray
      rgba[pixel * 4 + 3] = 255
    }
    return rgba
  }
  throw new OperationError('対応できない埋め込み画像があるため、取り出しを中止しました。')
}

async function imageToPng(image: any): Promise<{ bytes: Uint8Array, pixels: number }> {
  const { width, height, pixels } = imageDimensions(image)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  try {
    const context = canvas.getContext('2d')
    if (!context) throw new OperationError('埋め込み画像を作れないため、取り出しを中止しました。')
    if (image?.data) {
      const imageData = context.createImageData(width, height)
      imageData.data.set(imageBytesToRgba(image, pixels))
      context.putImageData(imageData, 0, 0)
    } else if (image?.bitmap) {
      context.drawImage(image.bitmap, 0, 0, width, height)
    } else {
      throw new OperationError('対応できない埋め込み画像があるため、取り出しを中止しました。')
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value?.size) resolve(value)
        else reject(new OperationError('埋め込み画像を作れないため、取り出しを中止しました。'))
      }, 'image/png')
    })
    return { bytes: new Uint8Array(await blob.arrayBuffer()), pixels }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

/** PDF.jsが読み取った埋め込み画像をPNGにしてZIPへまとめる。 */
export async function exportEmbeddedImages(
  pdfDoc: any,
  sourceName: string,
  onProgress: (progress: ExportProgress) => void = () => undefined,
): Promise<EmbeddedImagesResult> {
  const totalPages = Number(pdfDoc?.numPages)
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new OperationError('PDFのページを確認できないため、画像の取り出しを中止しました。')
  }
  const zip = new JSZip()
  const baseName = safeExportBaseName(sourceName)
  let imageCount = 0
  let totalPixels = 0

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = await pdfDoc.getPage(pageNumber)
    const operators = await page.getOperatorList()
    const seen = new Set<string>()
    for (const args of operators?.argsArray ?? []) {
      const first = args?.[0]
      const objectName = typeof first === 'string' && /(?:^|_)img_/.test(first) ? first : null
      const inlineImage = first?.data && first?.width && first?.height ? first : null
      if (!objectName && !inlineImage) continue
      if (objectName && seen.has(objectName)) continue
      if (objectName) seen.add(objectName)

      const objects = objectName?.startsWith('g_') ? page.commonObjs : page.objs
      const image = objectName ? await getPdfObject(objects, objectName) : inlineImage
      const converted = await imageToPng(image)
      totalPixels += converted.pixels
      imageCount += 1
      if (totalPixels > MAX_TOTAL_PIXELS || imageCount > MAX_IMAGE_COUNT) {
        throw new OperationError('埋め込み画像が多すぎるため、取り出しを中止しました。')
      }
      zip.file(`${baseName}-画像${String(imageCount).padStart(3, '0')}.png`, converted.bytes)
    }

    onProgress({
      completedPages: pageNumber,
      totalPages,
      percent: Math.round((pageNumber / totalPages) * 100),
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  if (imageCount === 0) {
    throw new OperationError('取り出せる埋め込み画像が見つかりませんでした。')
  }
  return {
    bytes: await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }),
    fileName: `${baseName}-埋め込み画像.zip`,
    mimeType: 'application/zip',
    imageCount,
  }
}
