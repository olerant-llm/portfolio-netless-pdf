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

import { imagesToPdfBytes } from '../../operations/addOp'
import { t } from '../../i18n/ja'

/** 取り込み元として開いたもの。画像を選んだ場合も、この形に直してから扱う */
export interface ImportSource {
  /** 画面に出す名前 */
  name: string
  bytes: Uint8Array
}

/** 取り込み元のPDFを読む。読めなければお知らせを出して null */
export async function readPdfSource(file: File): Promise<ImportSource | null> {
  try {
    return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
  } catch (err) {
    console.error(err)
    toast.error(t.errors.broken)
    return null
  }
}

/** 取り込み元の画像をまとめて1本のPDFに直す。直せなければお知らせを出して null */
export async function readImageSource(files: File[]): Promise<ImportSource | null> {
  try {
    const images = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      }))
    )
    const bytes = await imagesToPdfBytes(images)
    const name = files.length === 1 ? files[0].name : `${files[0].name} ほか${files.length - 1}件`
    return { name, bytes }
  } catch (err: any) {
    // imagesToPdfBytes のお知らせは日本語なので、そのまま出してよい
    console.error(err)
    toast.error(err?.message ?? t.errors.broken)
    return null
  }
}
