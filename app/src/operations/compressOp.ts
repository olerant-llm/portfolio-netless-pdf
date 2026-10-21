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

export type CompressionQuality = 'low' | 'medium' | 'high'

/** 軽量化の前に具体的に知らせる必要がある、画像への焼き直しで失う情報。 */
export const COMPRESS_INFORMATION_LOSSES = RASTERIZATION_INFORMATION_LOSSES

/** 高画質ほど描画を細かくし、JPEGの圧縮を弱くする。 */
export const compressionSettings: Record<CompressionQuality, {
  renderScale: number
  jpegQuality: number
}> = {
  high: { renderScale: 2, jpegQuality: 0.82 },
  medium: { renderScale: 1.5, jpegQuality: 0.65 },
  low: { renderScale: 1, jpegQuality: 0.45 },
}

export async function compressFromRasterPages(
  input: OperationInput,
  pages: RasterizedPdfPage[],
): Promise<OperationResult> {
  return rebuildPdfFromRasterPages(input, pages)
}

export interface CompressionCandidateInspection {
  canReplace: boolean
  originalSize: number
  resultSize: number
  savedBytes: number
  reductionPercent: number
}

/** 軽くならない結果で編集中のPDFを置き換えないための共通判定。 */
export function inspectCompressionCandidate(
  originalSize: number,
  resultSize: number,
): CompressionCandidateInspection {
  const savedBytes = Math.max(0, originalSize - resultSize)
  const reductionPercent = originalSize > 0
    ? Math.round((savedBytes / originalSize) * 1_000) / 10
    : 0

  return {
    canReplace: resultSize < originalSize,
    originalSize,
    resultSize,
    savedBytes,
    reductionPercent,
  }
}
