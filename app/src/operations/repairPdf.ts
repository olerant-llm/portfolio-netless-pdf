import { PDFDocument } from 'pdf-lib'
import { OperationError } from './types'

/**
 * PDFの内部構造を読み直して保存し直す。
 * パスワード付きPDFは修復対象にせず、解除の入口へ回す。
 */
export async function repairPdfBytes(bytes: Uint8Array) {
  try {
    const pdf = await PDFDocument.load(bytes.slice(), {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
      updateMetadata: false,
    })
    if (pdf.isEncrypted) {
      throw new OperationError('このPDFはパスワードで保護されています。修復ではなくパスワードを入力してください。')
    }

    const repaired = await pdf.save()
    // 「保存できた」だけで成功にしない。もう一度厳しい条件で開けることまで確かめる。
    await PDFDocument.load(repaired)
    return repaired
  } catch (error) {
    if (error instanceof OperationError) throw error
    throw new OperationError('このPDFは修復できませんでした。元のファイルは変更していません。')
  }
}
