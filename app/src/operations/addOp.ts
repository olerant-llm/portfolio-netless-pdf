/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { PDFDocument } from 'pdf-lib'
import { insertPages } from '../utils/pageInsert'
import { newPageId } from '../document/pageId'
import { OperationInput, OperationResult, OperationError } from './types'
import { validatePngOrJpeg } from './imageValidation'

/**
 * 追加する画像1枚ぶん。
 *
 * ブラウザの `File` ではなく中身のデータで受け取る。こうしておくと
 * この処理を画面なしで自動テストにかけられる（`File` はブラウザの部品）。
 */
export interface ImageInput {
  /** 画面のお知らせに出すファイル名 */
  name: string
  bytes: Uint8Array
}

export const MAX_PDF_IMAGE_COUNT = 200
export const MAX_PDF_IMAGE_TOTAL_BYTES = 200 * 1024 * 1024

/** PDF化する画像一式を、重い埋め込み処理へ入る前にまとめて確かめる。 */
export function validateImagesForPdf(images: ImageInput[]) {
  if (images.length === 0) {
    throw new OperationError('画像が選ばれていません。画像を選んでください。')
  }
  if (images.length > MAX_PDF_IMAGE_COUNT) {
    throw new OperationError(`画像は一度に${MAX_PDF_IMAGE_COUNT}枚まで選べます。`)
  }

  let totalBytes = 0
  return images.map((image) => {
    totalBytes += image.bytes.byteLength
    if (totalBytes > MAX_PDF_IMAGE_TOTAL_BYTES) {
      throw new OperationError('画像の合計が200MBを超えています。枚数を分けて作成してください。')
    }
    return validatePngOrJpeg(image.bytes, image.name)
  })
}

/**
 * 「入れる位置のページID」を、何ページ目に入れるかへ読み替える。
 * `null` は末尾。
 */
function resolveInsertAt(pageIds: string[], insertAtPageId: string | null): number {
  if (insertAtPageId === null) return pageIds.length

  const at = pageIds.indexOf(insertAtPageId)
  if (at < 0) throw new OperationError(`ページが見つかりません（内部の目印: ${insertAtPageId}）。`)
  return at
}

/**
 * 別のPDFのページを、開いている文書に足す。
 *
 * `insertAtPageId` が `null` なら末尾に足す。**これが「PDFの結合」にあたる。**
 * `sourcePageIndices` を渡さなければ取り込み元の全ページ、渡せばそのページだけを足す。
 * ページを足すだけなので、今ある絵は1枚も描き直さない。
 */
export async function addFromPdf(
  input: OperationInput,
  sourceBytes: Uint8Array,
  insertAtPageId: string | null,
  sourcePageIndices?: number[]
): Promise<OperationResult> {
  const at = resolveInsertAt(input.pageIds, insertAtPageId)

  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: true })
  const count = source.getPageCount()
  if (count === 0) {
    throw new OperationError('選んだPDFにはページがありません。別のファイルを選んでください。')
  }

  // 選んだ順ではなく、取り込み元の並び順で入れる（重複した指定は1枚にまとめる）
  const indices = sourcePageIndices === undefined
    ? Array.from({ length: count }, (_, i) => i)
    : [...new Set(sourcePageIndices)].sort((a, b) => a - b)

  if (indices.length === 0) {
    throw new OperationError('入れるページが選ばれていません。取り込み元のページを選んでください。')
  }
  for (const i of indices) {
    if (!Number.isInteger(i) || i < 0 || i >= count) {
      throw new OperationError(`取り込み元にないページが指定されました（${i + 1}ページ目）。`)
    }
  }

  const bytes = await insertPages(input.bytes, sourceBytes, indices, at)

  const addedIds = Array.from({ length: indices.length }, () => newPageId())
  const pageIds = [
    ...input.pageIds.slice(0, at),
    ...addedIds,
    ...input.pageIds.slice(at),
  ]

  return {
    bytes,
    pageIds,
    // 足したページはまだ絵を持っていないので、放っておいても描かれる
    invalidated: [],
  }
}

/**
 * 画像（PNG / JPEG）を1枚1ページのPDFにする。
 *
 * pdf-lib が読めるのは PNG と JPEG だけ。WebP や HEIC は読めないため、
 * 落ちる前にどのファイルが駄目かを示して断る。
 */
export async function imagesToPdfBytes(images: ImageInput[]): Promise<Uint8Array> {
  const validated = validateImagesForPdf(images)

  const doc = await PDFDocument.create()

  for (const [index, image] of images.entries()) {
    let embedded
    try {
      embedded = validated[index].kind === 'png'
        ? await doc.embedPng(image.bytes)
        : await doc.embedJpg(image.bytes)
    } catch {
      throw new OperationError(`「${image.name}」を読み込めませんでした。別のPNGまたはJPEGを選んでください。`)
    }

    const { width, height } = embedded.scale(1)
    const page = doc.addPage([width, height])
    page.drawImage(embedded, { x: 0, y: 0, width, height })
  }

  return await doc.save()
}

// 画像は、画面側（ImportSourcePicker）でここを通してPDFに直してから
// 取り込み元として開く。そのため「画像を直接足す」関数は用意しない
// （同じことをする道が2本あると、片方だけ直す事故が起きるため）。
