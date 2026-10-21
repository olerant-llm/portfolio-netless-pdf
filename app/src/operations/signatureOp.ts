/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { degrees, PDFDocument } from 'pdf-lib'

import { OperationError, OperationInput, OperationResult } from './types'

export type SignatureImageKind = 'png' | 'jpeg'

export interface VisibleSignaturePlacement {
  /** 表示された紙面の左端からの割合。紙面外の値は内側へ収める。 */
  left: number
  /** 表示された紙面の上端からの割合。紙面外の値は内側へ収める。 */
  top: number
  /** 表示された紙面幅に対する画像幅の割合。 */
  width: number
}

export interface SignatureOptions {
  pageId: string
  imageBytes: Uint8Array
  placement: VisibleSignaturePlacement
}

export interface SignaturePageBox {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface SignatureImageSize {
  width: number
  height: number
}

export interface PdfSignaturePlacement {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
export const MAX_SIGNATURE_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 12_000
const MAX_IMAGE_PIXELS = 40_000_000

function startsWith(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((value, index) => bytes[index] === value)
}

function readPngSize(bytes: Uint8Array): SignatureImageSize | undefined {
  if (bytes.length < 24 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function readJpegSize(bytes: Uint8Array): SignatureImageSize | undefined {
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ])
  let offset = 2
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) return undefined
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (offset + 1 >= bytes.length) return undefined
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) return undefined
    if (startOfFrame.has(marker)) {
      if (length < 7) return undefined
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      }
    }
    offset += length
  }
  return undefined
}

function validateImageSize(bytes: Uint8Array, kind: SignatureImageKind) {
  const size = kind === 'png' ? readPngSize(bytes) : readJpegSize(bytes)
  if (!size || size.width <= 0 || size.height <= 0) {
    throw new OperationError('署名画像を読み込めませんでした。別のPNGまたはJPEGを選んでください。')
  }
  if (
    size.width > MAX_IMAGE_DIMENSION
    || size.height > MAX_IMAGE_DIMENSION
    || size.width * size.height > MAX_IMAGE_PIXELS
  ) {
    throw new OperationError('署名画像が大きすぎます。12000ピクセル以下で、4000万画素以下の画像を選んでください。')
  }
}

/** ファイル名や申告形式を信用せず、先頭データから画像の種類を調べる。 */
export function detectSignatureImageKind(bytes: Uint8Array): SignatureImageKind {
  if (bytes.byteLength > MAX_SIGNATURE_IMAGE_BYTES) {
    throw new OperationError('署名画像は20MB以下のPNGまたはJPEGを選んでください。')
  }
  if (startsWith(bytes, PNG_HEADER)) {
    validateImageSize(bytes, 'png')
    return 'png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    validateImageSize(bytes, 'jpeg')
    return 'jpeg'
  }
  throw new OperationError('署名画像はPNGまたはJPEGを選んでください。')
}

function finite(value: number, message: string) {
  if (!Number.isFinite(value)) throw new OperationError(message)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** 画面の紙面上で決めた位置を、回転前のPDF座標へ変換する。 */
export function calculateSignaturePlacement(
  page: SignaturePageBox,
  image: SignatureImageSize,
  placement: VisibleSignaturePlacement,
): PdfSignaturePlacement {
  finite(page.x, 'PDFの紙面位置を確認できませんでした。')
  finite(page.y, 'PDFの紙面位置を確認できませんでした。')
  finite(page.width, 'PDFの紙面サイズを確認できませんでした。')
  finite(page.height, 'PDFの紙面サイズを確認できませんでした。')
  finite(image.width, '署名画像の大きさを確認できませんでした。')
  finite(image.height, '署名画像の大きさを確認できませんでした。')
  finite(placement.left, '署名画像の位置を確認できませんでした。')
  finite(placement.top, '署名画像の位置を確認できませんでした。')
  finite(placement.width, '署名画像の大きさを確認できませんでした。')

  if (page.width <= 0 || page.height <= 0) {
    throw new OperationError('PDFの紙面サイズを確認できませんでした。')
  }
  if (image.width <= 0 || image.height <= 0) {
    throw new OperationError('署名画像の大きさを確認できませんでした。')
  }
  if (placement.width < 0.02 || placement.width > 1) {
    throw new OperationError('署名画像の幅は紙面の2%から100%の間で指定してください。')
  }

  const rotation = ((page.rotation % 360) + 360) % 360
  if (![0, 90, 180, 270].includes(rotation)) {
    throw new OperationError('このページの回転角度には署名画像を配置できません。')
  }

  const sideways = rotation === 90 || rotation === 270
  const visibleWidth = sideways ? page.height : page.width
  const visibleHeight = sideways ? page.width : page.height
  const aspect = image.height / image.width
  const width = Math.min(placement.width * visibleWidth, visibleWidth, visibleHeight / aspect)
  const height = width * aspect
  const visibleLeft = clamp(placement.left * visibleWidth, 0, visibleWidth - width)
  const visibleTop = clamp(placement.top * visibleHeight, 0, visibleHeight - height)
  const visibleBottom = visibleHeight - visibleTop - height

  let x = page.x + visibleLeft
  let y = page.y + visibleBottom
  if (rotation === 90) {
    x = page.x + page.width - visibleBottom
    y = page.y + visibleLeft
  } else if (rotation === 180) {
    x = page.x + page.width - visibleLeft
    y = page.y + page.height - visibleBottom
  } else if (rotation === 270) {
    x = page.x + visibleBottom
    y = page.y + page.height - visibleLeft
  }

  return { x, y, width, height, rotation }
}

/** 開いているPDFの指定ページへ、証明機能を持たない署名画像を重ねる。 */
export async function signatureOperation(
  input: OperationInput,
  options: SignatureOptions,
): Promise<OperationResult> {
  const kind = detectSignatureImageKind(options.imageBytes)
  const pageIndex = input.pageIds.indexOf(options.pageId)
  if (pageIndex < 0) {
    throw new OperationError('署名画像を貼るページが見つかりません。選び直してください。')
  }

  const pdf = await PDFDocument.load(input.bytes.slice(), { updateMetadata: false })
  const pages = pdf.getPages()
  if (pages.length !== input.pageIds.length) {
    throw new OperationError('PDFのページ数と画面のページ情報が一致しません。変更を取り消しました。')
  }

  let image
  try {
    const imageBytes = options.imageBytes.slice()
    image = kind === 'png' ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes)
  } catch {
    throw new OperationError('署名画像を読み込めませんでした。別のPNGまたはJPEGを選んでください。')
  }

  const page = pages[pageIndex]
  const crop = page.getCropBox()
  const draw = calculateSignaturePlacement(
    { ...crop, rotation: page.getRotation().angle },
    { width: image.width, height: image.height },
    options.placement,
  )
  page.drawImage(image, {
    x: draw.x,
    y: draw.y,
    width: draw.width,
    height: draw.height,
    rotate: degrees(draw.rotation),
  })

  return {
    bytes: await pdf.save(),
    pageIds: [...input.pageIds],
    invalidated: [options.pageId],
  }
}
