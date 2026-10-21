/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { PDFDocument, degrees } from 'pdf-lib'
import { OperationInput, OperationResult, OperationError } from './types'
import {
  capturePageLabels,
  pruneDeletedPageReferences,
  reorderPageTree,
  restorePageLabels,
} from './pageStructure'

/** ページIDから、今の並びの中での位置（0始まり）を引く */
function indexOfIds(pageIds: string[], targets: string[]): number[] {
  return targets.map((id) => {
    const i = pageIds.indexOf(id)
    if (i < 0) throw new OperationError(`ページが見つかりません（内部の目印: ${id}）。`)
    return i
  })
}

/** 並べ替え。`newOrder` は並べ替え後のページIDの並び */
export async function reorderPages(
  input: OperationInput,
  newOrder: string[]
): Promise<OperationResult> {
  if (newOrder.length !== input.pageIds.length) {
    throw new OperationError(
      `ページの数が合いません（元: ${input.pageIds.length}ページ、指定: ${newOrder.length}ページ）。`
    )
  }
  // 枚数が合っていても、同じページが2回出てくる並びは通してはいけない。
  // ページIDが重複すると、サムネイルが共有され画面の並び管理が壊れる
  if (new Set(newOrder).size !== newOrder.length) {
    throw new OperationError('同じページが2回指定されています。並べ替えの指定が正しくありません。')
  }
  const indices = indexOfIds(input.pageIds, newOrder)

  const doc = await PDFDocument.load(input.bytes, { ignoreEncryption: true })
  const pageLabels = capturePageLabels(doc)
  reorderPageTree(doc, indices)
  restorePageLabels(doc, pageLabels, indices)

  return {
    bytes: await doc.save(),
    pageIds: newOrder,
    invalidated: [], // 順番が変わるだけで、ページの絵そのものは変わらない
  }
}

/** 削除 */
export async function deletePages(
  input: OperationInput,
  targets: string[]
): Promise<OperationResult> {
  if (targets.length === 0) {
    return { bytes: input.bytes, pageIds: input.pageIds, invalidated: [] }
  }

  const remove = new Set(targets)
  const remaining = input.pageIds.filter((id) => !remove.has(id))
  if (remaining.length === 0) {
    throw new OperationError('すべてのページを消すことはできません。1ページ以上残してください。')
  }

  const indices = indexOfIds(input.pageIds, remaining)
  const doc = await PDFDocument.load(input.bytes, { ignoreEncryption: true })
  const pageLabels = capturePageLabels(doc)
  const removedIndices = input.pageIds
    .map((id, index) => (remove.has(id) ? index : -1))
    .filter((index) => index >= 0)
  pruneDeletedPageReferences(doc, removedIndices)
  for (const index of [...removedIndices].sort((left, right) => right - left)) {
    doc.removePage(index)
  }
  restorePageLabels(doc, pageLabels, indices)

  return { bytes: await doc.save(), pageIds: remaining, invalidated: [] }
}

/** 回転。`delta` は 90 / 180 / 270 / -90 など */
export async function rotatePages(
  input: OperationInput,
  targets: string[],
  delta: number
): Promise<OperationResult> {
  const indices = indexOfIds(input.pageIds, targets)

  const doc = await PDFDocument.load(input.bytes, { ignoreEncryption: true })
  for (const i of indices) {
    const page = doc.getPage(i)
    const current = page.getRotation().angle
    // JavaScript の % はマイナスをマイナスのまま返すので、360を足して0〜359に収める
    page.setRotation(degrees((((current + delta) % 360) + 360) % 360))
  }

  return {
    bytes: await doc.save(),
    pageIds: input.pageIds,
    invalidated: [...targets], // 回したページは絵を描き直す
  }
}

/**
 * 選んだページを取り出して、別のPDFのデータとして返す。
 *
 * 他の操作と違い OperationResult を返さない。開いている文書を書き換えず、
 * 別ファイルとして書き出すためのもの（＝これは「編集」ではなく「書き出し」）。
 */
export async function extractPages(
  input: OperationInput,
  targets: string[]
): Promise<Uint8Array> {
  if (targets.length === 0) {
    throw new OperationError('取り出すページが選ばれていません。ページを選んでください。')
  }
  // 選んだ順ではなく、元の並び順で取り出す
  const chosen = new Set(targets)
  const indices = input.pageIds
    .map((id, i) => (chosen.has(id) ? i : -1))
    .filter((i) => i >= 0)

  const src = await PDFDocument.load(input.bytes, { ignoreEncryption: true })
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, indices)
  copied.forEach((p) => out.addPage(p))

  return await out.save()
}
