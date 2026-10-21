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

export interface WatermarkOptions {
  text: string
  /** #RRGGBB */
  color: string
  /** 0.1〜1 */
  opacity: number
  /** 10〜200pt */
  fontSize: number
  /** -180〜180度 */
  rotation: number
}

function validateOptions(options: WatermarkOptions) {
  if (!options.text.trim()) {
    throw new OperationError('透かしの文字を入力してください。')
  }
  if (!/^#[0-9a-f]{6}$/i.test(options.color)) {
    throw new OperationError('透かしの色を選び直してください。')
  }
  if (!Number.isFinite(options.opacity) || options.opacity < 0.1 || options.opacity > 1) {
    throw new OperationError('透明度は10%から100%の間で指定してください。')
  }
  if (!Number.isFinite(options.fontSize) || options.fontSize < 10 || options.fontSize > 200) {
    throw new OperationError('文字の大きさは10ptから200ptの間で指定してください。')
  }
  if (!Number.isFinite(options.rotation) || options.rotation < -180 || options.rotation > 180) {
    throw new OperationError('文字の角度は-180度から180度の間で指定してください。')
  }
}

function colorFromHex(hex: string) {
  return rgb(
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  )
}

/** 開いているPDFの全ページ中央へ文字の透かしを重ねる。 */
export async function watermarkOperation(
  input: OperationInput,
  options: WatermarkOptions,
): Promise<OperationResult> {
  validateOptions(options)

  const pdf = await PDFDocument.load(input.bytes.slice())
  const pages = pdf.getPages()
  if (pages.length !== input.pageIds.length) {
    throw new OperationError('PDFのページ数と画面のページ情報が一致しません。変更を取り消しました。')
  }

  const font = await embedTextFont(pdf, options.text, true)
  const color = colorFromHex(options.color)
  const angle = options.rotation * Math.PI / 180
  const textWidth = font.widthOfTextAtSize(options.text, options.fontSize)
  const textHeight = font.heightAtSize(options.fontSize, { descender: false })
  const centerOffsetX = Math.cos(angle) * textWidth / 2 - Math.sin(angle) * textHeight / 2
  const centerOffsetY = Math.sin(angle) * textWidth / 2 + Math.cos(angle) * textHeight / 2

  pages.forEach((page) => {
    const crop = page.getCropBox()
    page.drawText(options.text, {
      x: crop.x + crop.width / 2 - centerOffsetX,
      y: crop.y + crop.height / 2 - centerOffsetY,
      size: options.fontSize,
      font,
      color,
      opacity: options.opacity,
      rotate: degrees(options.rotation),
    })
  })

  return {
    bytes: await pdf.save(),
    pageIds: [...input.pageIds],
    invalidated: [...input.pageIds],
  }
}
