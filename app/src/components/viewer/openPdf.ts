/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { toast } from 'sonner'
import { OpenDocumentError } from '../../document/documentSession'
import { t } from '../../i18n/ja'

/**
 * PDFファイルをビューアーで開く。失敗したら理由ごとに日本語のお知らせを出す。
 *
 * 「PDFを開く」画面と、画面全体へのドロップの2か所から呼ぶため、
 * お知らせの出し方をここ1か所にまとめてある。
 */
export async function openPdfFile(
  file: File,
  openDocument: (bytes: Uint8Array, name: string) => Promise<void>
): Promise<void> {
  const looksLikePdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!looksLikePdf) {
    toast.error(t.errors.notPdf)
    return
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    await openDocument(bytes, file.name.replace(/\.pdf$/i, ''))
  } catch (err) {
    // OpenDocumentError のときは、文書の入れ物が生データを保持し、
    // パスワード入力または修復の専用画面を出す。ここで同じ赤い通知を重ねない。
    if (!(err instanceof OpenDocumentError)) toast.error(t.errors.broken)
  }
}
