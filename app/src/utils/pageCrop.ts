import { PDFDocument } from 'pdf-lib'

/** 四辺から切り落とす量。単位はPDFの座標（1単位 = 1/72インチ） */
export interface CropMargins {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * 指定したページの余白を切り落とす。
 *
 * @param pdfBytes    元のPDF
 * @param pageIndices 切るページの番号（0が1ページ目）
 * @param margins     四辺から切り落とす量
 */
export async function cropPages(
  pdfBytes: Uint8Array,
  pageIndices: number[],
  margins: CropMargins
): Promise<Uint8Array> {
  const values = [margins.left, margins.right, margins.top, margins.bottom]
  if (values.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new Error('切り取る量は0以上の数値で指定してください。')
  }

  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const pageCount = doc.getPageCount()

  for (const i of pageIndices) {
    if (!Number.isInteger(i) || i < 0 || i >= pageCount) {
      throw new Error(
        `ページ番号が正しくありません（指定: ${i}、このPDFは${pageCount}ページです）。`
      )
    }

    const page = doc.getPage(i)
    const box = page.getMediaBox()
    const newWidth = box.width - margins.left - margins.right
    const newHeight = box.height - margins.top - margins.bottom

    if (newWidth <= 0 || newHeight <= 0) {
      throw new Error(
        `${i + 1}ページ目で切り取る量が大きすぎます。ページが残りません。切り取る量を減らしてください。`
      )
    }

    // PDFの座標は左下が原点。下からの余白ぶん上へずらし、高さを縮める
    const newX = box.x + margins.left
    const newY = box.y + margins.bottom

    page.setMediaBox(newX, newY, newWidth, newHeight)
    page.setCropBox(newX, newY, newWidth, newHeight)
  }

  return await doc.save()
}
