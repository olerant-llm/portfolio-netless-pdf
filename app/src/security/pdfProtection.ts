import { PDF, PermissionDeniedError } from '@libpdf/core'
import { OperationError } from '../operations/types'

const DECRYPTION_FAILURE_PREFIX = 'Failed to decrypt object '
const MODIFY_CONTENTS_PERMISSION = 8
const ASSEMBLE_PAGES_PERMISSION = 1024

export type PdfEditingProtection = 'none' | 'restricted' | 'protected'

/**
 * PDF.js が返す許可一覧から、編集前に保護解除が必要かを判定する。
 * null は暗号化されていない通常PDF。配列が返るPDFは暗号化されているため、
 * 権限が十分でも pdf-lib へ渡す前に保護解除が必要になる。
 */
export function classifyPdfEditingProtection(
  permissions: readonly number[] | null,
): PdfEditingProtection {
  if (permissions === null) return 'none'

  const canModifyContents = permissions.includes(MODIFY_CONTENTS_PERMISSION)
  const canAssemblePages = permissions.includes(ASSEMBLE_PAGES_PERMISSION)
  return canModifyContents && canAssemblePages ? 'protected' : 'restricted'
}

export async function detectPdfEditingProtection(pdfDoc: {
  getPermissions: () => Promise<number[] | null>
}): Promise<PdfEditingProtection> {
  return classifyPdfEditingProtection(await pdfDoc.getPermissions())
}

async function failIfLibPdfCannotDecrypt<T>(operation: () => Promise<T>): Promise<T> {
  const originalWarn = console.warn
  let decryptionFailed = false
  const guardedWarn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith(DECRYPTION_FAILURE_PREFIX)) {
      decryptionFailed = true
      return
    }
    originalWarn(...args)
  }

  console.warn = guardedWarn
  try {
    const result = await operation()
    if (decryptionFailed) {
      throw new OperationError('PDF内の一部データを復号できないため、安全に保護を外せません。')
    }
    return result
  } finally {
    if (console.warn === guardedWarn) {
      console.warn = originalWarn
    }
  }
}

/**
 * パスワード保護を外し、通常の編集用PDFデータへ戻す。
 * 保存後にもう一度パスワードなしで開き、本当に解除できた場合だけ返す。
 */
export async function removePdfProtection(bytes: Uint8Array, password: string) {
  try {
    return await failIfLibPdfCannotDecrypt(async () => {
      const pdf = await PDF.load(bytes, { credentials: password })
      if (!pdf.isEncrypted || !pdf.isAuthenticated) {
        throw new OperationError('パスワードを確認できませんでした。')
      }

      const algorithm = pdf.getSecurity().algorithm
      if (algorithm === undefined || !['RC4-40', 'RC4-128', 'AES-256'].includes(algorithm)) {
        throw new OperationError(
          'このPDFの保護方式には安全確認が済んでいないため、現在は対応していません。',
        )
      }

      pdf.removeProtection()
      const result = await pdf.save()
      const verification = await PDF.load(result)
      if (verification.isEncrypted) {
        throw new OperationError('パスワード保護を外せませんでした。')
      }
      return result
    })
  } catch (error) {
    if (error instanceof OperationError) throw error
    if (error instanceof PermissionDeniedError) {
      throw new OperationError(
        'このPDFは閲覧用パスワードでは保護を外せません。所有者用パスワードを入力してください。',
      )
    }
    throw new OperationError('パスワードが違うか、このPDFの保護方式には対応していません。')
  }
}

/**
 * 現在のPDFそのものへAES-256保護を付ける。
 * ページを空のPDFへ写し直さないため、しおりや文書情報も元のまま保つ。
 */
export async function protectPdfBytes(bytes: Uint8Array, password: string) {
  if (password.length === 0) {
    throw new OperationError('パスワードを入力してください。')
  }

  if (new TextEncoder().encode(password).length > 127) {
    throw new OperationError('パスワードはUTF-8で127バイト以内にしてください。')
  }

  try {
    const pdf = await PDF.load(bytes)
    pdf.setProtection({
      algorithm: 'AES-256',
      userPassword: password,
    })
    const result = await pdf.save()
    const verification = await PDF.load(result, { credentials: password })
    if (
      !verification.isEncrypted
      || !verification.isAuthenticated
      || verification.getSecurity().algorithm !== 'AES-256'
    ) {
      throw new OperationError('PDFをAES-256で保護できませんでした。')
    }
    return result
  } catch (error) {
    if (error instanceof OperationError) throw error
    throw new OperationError('PDFにパスワードを設定できませんでした。')
  }
}
