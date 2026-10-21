import { PDFDocument } from 'pdf-lib'
import { repairCopiedPageLinks } from '../operations/pageStructure'

/**
 * ベースとなるPDF（baseBytes）の指定位置（insertAt）に、
 * 別のPDF（sourceBytes）から指定インデックス（sourcePageIndices）のページ群を差込み、
 * 完成したPDFの Uint8Array を返します。
 *
 * @param baseBytes 差し込み先のPDFバイナリ
 * @param sourceBytes 差し込むページが含まれるPDFバイナリ
 * @param sourcePageIndices 差し込むページのインデックス（0開始）の配列
 * @param insertAt 差し込み位置（0 = 先頭、baseのページ数 = 末尾）
 */
export async function insertPages(
  baseBytes: Uint8Array,
  sourceBytes: Uint8Array,
  sourcePageIndices: number[],
  insertAt: number
): Promise<Uint8Array> {
  const baseDoc = await PDFDocument.load(baseBytes, { ignoreEncryption: true })
  const sourceDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true })

  // 挿入対象のページをコピー
  const copiedPages = await baseDoc.copyPages(sourceDoc, sourcePageIndices)
  repairCopiedPageLinks(sourceDoc, sourcePageIndices, copiedPages, baseDoc)

  const totalBasePages = baseDoc.getPageCount()
  let targetIndex = Math.max(0, Math.min(insertAt, totalBasePages))

  for (const page of copiedPages) {
    baseDoc.insertPage(targetIndex, page)
    targetIndex++
  }

  return await baseDoc.save()
}
