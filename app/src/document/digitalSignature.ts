import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFObject,
  PDFString,
} from 'pdf-lib'

export type DigitalSignatureStatus = 'none' | 'signed' | 'unknown'

const ACRO_FORM = PDFName.of('AcroForm')
const BYTE_RANGE = PDFName.of('ByteRange')
const CONTENTS = PDFName.of('Contents')
const FIELD_TYPE = PDFName.of('FT')
const FIELDS = PDFName.of('Fields')
const KIDS = PDFName.of('Kids')
const SIGNATURE = '/Sig'
const VALUE = PDFName.of('V')

function isSignedValue(pdf: PDFDocument, value: PDFObject | undefined) {
  const signature = pdf.context.lookupMaybe(value, PDFDict)
  if (!signature) return false

  const byteRange = signature.lookupMaybe(BYTE_RANGE, PDFArray)
  const contents = signature.lookupMaybe(CONTENTS, PDFString, PDFHexString)
  return Boolean(byteRange && byteRange.size() >= 4 && contents)
}

function scannedDictionaryIsSigned(pdf: PDFDocument, value: PDFObject) {
  try {
    return isSignedValue(pdf, value)
  } catch {
    // 全辞書を調べる際、ページの /Contents など同名で別用途の値も現れる。
    // 署名辞書の形でなければ判定不能にせず、その辞書だけを読み飛ばす。
    return false
  }
}

function fieldTreeContainsSignature(
  pdf: PDFDocument,
  field: PDFDict,
  inheritedType: PDFName | undefined,
  visited: Set<PDFDict>,
): boolean {
  if (visited.has(field)) return false
  visited.add(field)

  const fieldType = field.lookupMaybe(FIELD_TYPE, PDFName) ?? inheritedType
  if (fieldType?.asString() === SIGNATURE && isSignedValue(pdf, field.get(VALUE))) {
    return true
  }

  const kids = field.lookupMaybe(KIDS, PDFArray)
  if (!kids) return false
  for (let index = 0; index < kids.size(); index += 1) {
    const child = pdf.context.lookupMaybe(kids.get(index), PDFDict)
    if (child && fieldTreeContainsSignature(pdf, child, fieldType, visited)) return true
  }
  return false
}

/**
 * 証明書による署名値と署名対象範囲がそろったPDFだけを「署名済み」とする。
 * 署名用の入力欄があるだけで、まだ署名されていないPDFは対象にしない。
 */
export async function detectDigitalSignature(bytes: Uint8Array): Promise<DigitalSignatureStatus> {
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
    const acroForm = pdf.catalog.lookupMaybe(ACRO_FORM, PDFDict)
    const fields = acroForm?.lookupMaybe(FIELDS, PDFArray)
    if (fields) {
      const visited = new Set<PDFDict>()
      for (let index = 0; index < fields.size(); index += 1) {
        const field = pdf.context.lookupMaybe(fields.get(index), PDFDict)
        if (field && fieldTreeContainsSignature(pdf, field, undefined, visited)) return 'signed'
      }
    }

    // PDFによっては署名辞書がAcroFormの外から参照されるため、全登録データも確認する。
    for (const [, object] of pdf.context.enumerateIndirectObjects()) {
      if (object instanceof PDFDict && scannedDictionaryIsSigned(pdf, object)) return 'signed'
    }
    return 'none'
  } catch {
    // 判定できない文書を「署名なし」と決めつけると、警告なしで署名を壊し得る。
    return 'unknown'
  }
}

type RequestConfirmation = (status: Exclude<DigitalSignatureStatus, 'none'>) => Promise<boolean>

/** 同じ文書では、最初の編集が成功するまで警告を出す。 */
export class FirstEditSignatureGuard {
  private editApplied = false

  private async allow(status: DigitalSignatureStatus, requestConfirmation: RequestConfirmation) {
    if (status === 'none' || this.editApplied) return true
    return await requestConfirmation(status)
  }

  async run(
    status: DigitalSignatureStatus,
    requestConfirmation: RequestConfirmation,
    applyEdit: () => Promise<boolean>,
  ) {
    if (!await this.allow(status, requestConfirmation)) return false
    const applied = await applyEdit()
    if (applied) this.markEditApplied()
    return applied
  }

  private markEditApplied() {
    this.editApplied = true
  }
}
