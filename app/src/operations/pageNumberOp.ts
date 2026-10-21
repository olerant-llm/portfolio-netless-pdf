/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { degrees, PDFDocument, rgb } from 'pdf-lib'

import { embedTextFont } from '../utils/jpFont'
import { OperationError, OperationInput, OperationResult } from './types'

export type PageNumberPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export interface PageNumberOptions {
  /** {n}を番号、{total}を最終番号に置き換える */
  format: string
  startNumber: number
  position: PageNumberPosition
  /** #RRGGBB */
  color: string
  /** 8〜72pt */
  fontSize: number
}

const POSITIONS: PageNumberPosition[] = [
  'top-left', 'top-center', 'top-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

export function formatPageNumber(format: string, number: number, total: number): string {
  return format.split('{n}').join(String(number)).split('{total}').join(String(total))
}

function validateOptions(options: PageNumberOptions) {
  if (!options.format.trim()) {
    throw new OperationError('ページ番号の書式を入力してください。')
  }
  if (!options.format.includes('{n}')) {
    throw new OperationError('ページ番号の書式には {n} を入れてください。')
  }
  if (
    !Number.isInteger(options.startNumber)
    || options.startNumber < 1
    || options.startNumber > 999_999
  ) {
    throw new OperationError('開始番号は1から999999までの整数で指定してください。')
  }
  if (!POSITIONS.includes(options.position)) {
    throw new OperationError('ページ番号の位置を選び直してください。')
  }
  if (!/^#[0-9a-f]{6}$/i.test(options.color)) {
    throw new OperationError('ページ番号の色を選び直してください。')
  }
  if (!Number.isFinite(options.fontSize) || options.fontSize < 8 || options.fontSize > 72) {
    throw new OperationError('文字の大きさは8ptから72ptの間で指定してください。')
  }
}

function colorFromHex(hex: string) {
  return rgb(
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  )
}

/** 開いているPDFの全ページへ通し番号を重ねる。 */
export async function pageNumberOperation(
  input: OperationInput,
  options: PageNumberOptions,
): Promise<OperationResult> {
  validateOptions(options)

  const pdf = await PDFDocument.load(input.bytes.slice())
  const pages = pdf.getPages()
  if (pages.length !== input.pageIds.length) {
    throw new OperationError('PDFのページ数と画面のページ情報が一致しません。変更を取り消しました。')
  }

  const finalNumber = options.startNumber + pages.length - 1
  const labels = pages.map((_, index) => (
    formatPageNumber(options.format, options.startNumber + index, finalNumber)
  ))
  const font = await embedTextFont(pdf, labels.join(''))
  const color = colorFromHex(options.color)
  const margin = 20

  pages.forEach((page, index) => {
    const crop = page.getCropBox()
    const label = labels[index]
    const textWidth = font.widthOfTextAtSize(label, options.fontSize)
    const textHeight = font.heightAtSize(options.fontSize, { descender: false })
    const rotation = ((page.getRotation().angle % 360) + 360) % 360
    const sideways = rotation === 90 || rotation === 270
    const visibleWidth = sideways ? crop.height : crop.width
    const visibleHeight = sideways ? crop.width : crop.height
    let visibleX = (visibleWidth - textWidth) / 2
    let visibleY = margin

    if (options.position.endsWith('left')) visibleX = margin
    if (options.position.endsWith('right')) visibleX = visibleWidth - margin - textWidth
    if (options.position.startsWith('top')) {
      visibleY = visibleHeight - margin - textHeight
    }

    let x = crop.x + visibleX
    let y = crop.y + visibleY
    if (rotation === 90) {
      x = crop.x + crop.width - visibleY
      y = crop.y + visibleX
    } else if (rotation === 180) {
      x = crop.x + crop.width - visibleX
      y = crop.y + crop.height - visibleY
    } else if (rotation === 270) {
      x = crop.x + visibleY
      y = crop.y + crop.height - visibleX
    }

    page.drawText(label, {
      x,
      y,
      size: options.fontSize,
      font,
      color,
      rotate: degrees(rotation),
    })
  })

  return {
    bytes: await pdf.save(),
    pageIds: [...input.pageIds],
    invalidated: [...input.pageIds],
  }
}
