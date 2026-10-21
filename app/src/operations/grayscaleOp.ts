/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import {
  RASTERIZATION_INFORMATION_LOSSES,
  rebuildPdfFromRasterPages,
  RasterizedPdfPage,
} from './lossyRasterOp'
import { OperationInput, OperationResult } from './types'

/** 白黒化の前に具体的に知らせる必要がある、画像への焼き直しで失う情報。 */
export const GRAYSCALE_INFORMATION_LOSSES = RASTERIZATION_INFORMATION_LOSSES

/** 既存処理と同じ白黒JPEGの試作設定。紙面寸法とは切り離して扱う。 */
export const GRAYSCALE_RASTER_SETTINGS = {
  renderScale: 1.5,
  jpegQuality: 0.75,
} as const

export async function grayscaleFromRasterPages(
  input: OperationInput,
  pages: RasterizedPdfPage[],
): Promise<OperationResult> {
  return rebuildPdfFromRasterPages(input, pages)
}
