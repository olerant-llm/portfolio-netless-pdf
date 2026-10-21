/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { OperationError } from '../operations/types'
import { ExportProgress } from './exportProgress'

export interface TextExportResult {
  text: string
  pageCount: number
  hasText: boolean
}

const MAX_TEXT_CHARACTERS = 50_000_000

function orderedPageNumbers(pageIds: string[], targets: string[]): number[] {
  if (targets.length === 0) throw new OperationError('文字を取り出すページが選択されていません。')
  const chosen = new Set(targets)
  if (chosen.size !== targets.length || targets.some((id) => !pageIds.includes(id))) {
    throw new OperationError('選択したページが見つかりません。もう一度選び直してください。')
  }
  return pageIds
    .map((id, index) => (chosen.has(id) ? index + 1 : -1))
    .filter((pageNumber) => pageNumber >= 1)
}

/** 選択した各ページから文字情報を読み、画面表示と保存に使える文字列へまとめる。 */
export async function extractPdfText(
  pdfDoc: any,
  pageIds: string[],
  targets: string[],
  onProgress: (progress: ExportProgress) => void = () => undefined,
): Promise<TextExportResult> {
  if (Number(pdfDoc?.numPages) !== pageIds.length) {
    throw new OperationError('PDFのページ情報が一致しないため、文字の取り出しを中止しました。')
  }
  const pageNumbers = orderedPageNumbers(pageIds, targets)
  const sections: string[] = []
  let hasText = false
  let totalCharacters = 0

  for (let offset = 0; offset < pageNumbers.length; offset += 1) {
    const pageNumber = pageNumbers[offset]
    try {
      const page = await pdfDoc.getPage(pageNumber)
      const content = await page.getTextContent()
      let pageText = ''
      for (const item of content?.items ?? []) {
        const value = typeof item?.str === 'string' ? item.str : ''
        if (!value) continue
        hasText ||= value.trim().length > 0
        pageText += value
        pageText += item.hasEOL ? '\n' : ' '
        totalCharacters += value.length + 1
        if (totalCharacters > MAX_TEXT_CHARACTERS) {
          throw new OperationError('取り出す文字が多すぎるため、中止しました。')
        }
      }
      sections.push(`--- ${pageNumber}ページ目 ---\n${pageText.trimEnd()}\n`)
    } catch (error) {
      if (error instanceof OperationError) throw error
      throw new OperationError(`${pageNumber}ページ目の文字を読み取れないため、中止しました。`)
    }

    onProgress({
      completedPages: offset + 1,
      totalPages: pageNumbers.length,
      percent: Math.round(((offset + 1) / pageNumbers.length) * 100),
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  return {
    text: sections.join('\n'),
    pageCount: pageNumbers.length,
    hasText,
  }
}
