/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { PDFDocument, PDFName, PDFNumber, degrees } from 'pdf-lib'
import { OperationError, OperationInput, OperationResult } from './types'

/** 画像への焼き直しを伴う操作で、実行前に知らせる必要がある情報損失。 */
export const RASTERIZATION_INFORMATION_LOSSES = [
  '文字検索・コピー',
  '内部リンク',
  '外部リンク',
  '入力欄',
  '注釈',
  'しおり',
  '文書情報',
  '添付ファイル',
  'ページラベル',
  '電子署名',
] as const

/** 画面側で描いた1ページ分の画像。紙面情報は信頼せず、元PDFから引き継ぐ。 */
export interface RasterizedPdfPage {
  imageBytes: Uint8Array
  imageKind: 'jpg' | 'png'
  /** 元の回転情報は組み立て時に戻すため、画像自体には回転を適用しない。 */
  renderedRotation: 0
}

export interface PreparedRasterCandidate {
  sourceBytes: Uint8Array
  sourcePageIds: string[]
  result: OperationResult
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

/** 見本確認中に元PDFが変わっていない場合だけ、用意済みの結果を反映用に返す。 */
export function applyPreparedRasterCandidate(
  input: OperationInput,
  candidate: PreparedRasterCandidate,
): OperationResult {
  const samePages = input.pageIds.length === candidate.sourcePageIds.length
    && input.pageIds.every((id, index) => id === candidate.sourcePageIds[index])
  if (!sameBytes(input.bytes, candidate.sourceBytes) || !samePages) {
    throw new OperationError('確認中にPDFが変わったため、この結果は反映しませんでした。もう一度お試しください。')
  }
  return {
    bytes: candidate.result.bytes.slice(),
    pageIds: [...candidate.result.pageIds],
    invalidated: [...candidate.result.invalidated],
  }
}

/** PDF.jsへ渡す描画条件。回転は画像とPDFで二重に適用しない。 */
export function rasterViewportOptions(renderScale: number) {
  if (!Number.isFinite(renderScale) || renderScale <= 0) {
    throw new OperationError('画像の細かさの設定が正しくないため、処理を中止しました。')
  }
  return { scale: renderScale, rotation: 0 as const }
}

/** 描画時のピクセル倍率を除き、PDF上で保つべき紙面寸法へ戻す。 */
export function paperSizeFromRenderedViewport(
  viewportWidth: number,
  viewportHeight: number,
  renderScale: number,
) {
  rasterViewportOptions(renderScale)
  return {
    width: viewportWidth / renderScale,
    height: viewportHeight / renderScale,
  }
}

/**
 * 描画済みの各ページを、同じ紙面寸法のPDFへ組み立てる。
 *
 * 紙面寸法・余白範囲・回転は入力PDFから直接引き継ぐ。
 * 画面側から任意の寸法を渡せない形にして、描画倍率で紙面を拡大しない。
 */
export async function rebuildPdfFromRasterPages(
  input: OperationInput,
  pages: RasterizedPdfPage[],
): Promise<OperationResult> {
  const source = await PDFDocument.load(input.bytes)
  const sourcePages = source.getPages()
  const expectedPageCount = source.getPageCount()
  if (input.pageIds.length !== expectedPageCount || pages.length !== expectedPageCount) {
    throw new OperationError('PDFと画像のページ数が合わないため、処理を中止しました。')
  }

  const output = await PDFDocument.create()
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    const sourcePage = sourcePages[index]
    if (page.renderedRotation !== 0) {
      throw new OperationError('ページ画像の向きが正しくないため、処理を中止しました。')
    }
    let image
    try {
      image = page.imageKind === 'png'
        ? await output.embedPng(page.imageBytes)
        : await output.embedJpg(page.imageBytes)
    } catch {
      throw new OperationError('ページ画像をPDFへ入れられないため、処理を中止しました。')
    }

    const media = sourcePage.getMediaBox()
    const crop = sourcePage.getCropBox()
    const bleed = sourcePage.getBleedBox()
    const trim = sourcePage.getTrimBox()
    const art = sourcePage.getArtBox()
    const outputPage = output.addPage([media.width, media.height])
    outputPage.setMediaBox(media.x, media.y, media.width, media.height)
    outputPage.setCropBox(crop.x, crop.y, crop.width, crop.height)
    outputPage.setBleedBox(bleed.x, bleed.y, bleed.width, bleed.height)
    outputPage.setTrimBox(trim.x, trim.y, trim.width, trim.height)
    outputPage.setArtBox(art.x, art.y, art.width, art.height)
    outputPage.setRotation(degrees(sourcePage.getRotation().angle))

    const userUnitName = PDFName.of('UserUnit')
    const inheritedUserUnit = sourcePage.node.getInheritableAttribute(userUnitName)
    const userUnit = source.context.lookupMaybe(inheritedUserUnit, PDFNumber)
    if (userUnit) outputPage.node.set(userUnitName, PDFNumber.of(userUnit.asNumber()))

    // 画面側は回転を0度にしてCropBoxの範囲を描く。元の回転情報は上で戻す。
    outputPage.drawImage(image, {
      x: crop.x,
      y: crop.y,
      width: crop.width,
      height: crop.height,
    })
  }

  return {
    bytes: await output.save(),
    pageIds: [...input.pageIds],
    invalidated: [...input.pageIds],
  }
}
