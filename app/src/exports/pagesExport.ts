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
import { PDFDocument } from 'pdf-lib'

import { extractPages } from '../operations/pageOps'
import { OperationError, OperationInput } from '../operations/types'
import { safeExportBaseName } from './fileNames'

export type PagesExportMode = 'single' | 'separate'

export interface PagesExportResult {
  bytes: Uint8Array
  fileName: string
  mimeType: 'application/pdf' | 'application/zip'
  pageCount: number
}

function selectedIndices(input: OperationInput, targets: string[]): number[] {
  if (targets.length === 0) {
    throw new OperationError('書き出すページが選択されていません。')
  }
  const chosen = new Set(targets)
  if (chosen.size !== targets.length || targets.some((id) => !input.pageIds.includes(id))) {
    throw new OperationError('選択したページが見つかりません。もう一度選び直してください。')
  }
  return input.pageIds
    .map((id, index) => (chosen.has(id) ? index : -1))
    .filter((index) => index >= 0)
}

/** 選択ページを別ファイルへ作る。入力PDFと編集履歴は変更しない。 */
export async function exportSelectedPages(
  input: OperationInput,
  targets: string[],
  mode: PagesExportMode,
  sourceName: string,
): Promise<PagesExportResult> {
  const indices = selectedIndices(input, targets)
  const baseName = safeExportBaseName(sourceName)

  if (mode === 'single') {
    return {
      bytes: await extractPages(input, targets),
      fileName: `${baseName}-選択ページ.pdf`,
      mimeType: 'application/pdf',
      pageCount: indices.length,
    }
  }

  const source = await PDFDocument.load(input.bytes, { ignoreEncryption: true })
  const zip = new JSZip()
  const digits = Math.max(3, String(input.pageIds.length).length)
  for (const index of indices) {
    const output = await PDFDocument.create()
    const [page] = await output.copyPages(source, [index])
    output.addPage(page)
    const pageNumber = String(index + 1).padStart(digits, '0')
    zip.file(`${baseName}-ページ${pageNumber}.pdf`, await output.save())
  }

  return {
    bytes: await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }),
    fileName: `${baseName}-選択ページ.zip`,
    mimeType: 'application/zip',
    pageCount: indices.length,
  }
}
