/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { cropPages, CropMargins } from '../utils/pageCrop'
import { OperationInput, OperationResult, OperationError } from './types'

export type { CropMargins }

/**
 * 選んだページ（1枚も選んでいなければ全ページ）の余白を切り落とす。
 *
 * 中身の処理は既存の `pageCrop.ts` をそのまま呼ぶ。ここがやるのは
 * 「ページID → 何ページ目か」の読み替えと、絵を描き直すページの申告だけ。
 */
export async function cropOperation(
  input: OperationInput,
  targets: string[],
  margins: CropMargins
): Promise<OperationResult> {
  const applyTo = targets.length > 0 ? targets : input.pageIds

  const indices = applyTo.map((id) => {
    const i = input.pageIds.indexOf(id)
    if (i < 0) throw new OperationError(`ページが見つかりません（内部の目印: ${id}）。`)
    return i
  })

  const bytes = await cropPages(input.bytes, indices, margins)

  return {
    bytes,
    pageIds: input.pageIds,
    invalidated: [...applyTo], // 形が変わるので、そのページの絵は描き直す
  }
}
