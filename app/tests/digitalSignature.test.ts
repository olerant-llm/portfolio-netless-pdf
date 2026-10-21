import { describe, expect, it, vi } from 'vitest'
import { PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'
import {
  detectDigitalSignature,
  FirstEditSignatureGuard,
} from '../src/document/digitalSignature'

async function makePdfWithSignatureField(signed: boolean, malformed = false) {
  const pdf = await PDFDocument.create()
  pdf.addPage([200, 300])

  const fieldEntries: Record<string, ReturnType<typeof PDFName.of> | ReturnType<typeof PDFString.of>> = {
    FT: PDFName.of('Sig'),
    T: PDFString.of('signature-1'),
  }

  if (signed) {
    const signature = pdf.context.obj({
      Type: PDFName.of('Sig'),
      Filter: PDFName.of('Adobe.PPKLite'),
      SubFilter: PDFName.of('adbe.pkcs7.detached'),
      ByteRange: malformed ? PDFString.of('not-an-array') : [0, 100, 200, 300],
      Contents: PDFHexString.of('00112233'),
    })
    fieldEntries.V = pdf.context.register(signature)
  }

  const field = pdf.context.register(pdf.context.obj(fieldEntries))
  const acroForm = pdf.context.register(pdf.context.obj({
    Fields: [field],
    SigFlags: signed ? 3 : 1,
  }))
  pdf.catalog.set(PDFName.of('AcroForm'), acroForm)
  return await pdf.save({ useObjectStreams: false })
}

describe('detectDigitalSignature（証明書による電子署名の検出）', () => {
  it('署名値と署名対象範囲があるPDFを検出する', async () => {
    expect(await detectDigitalSignature(await makePdfWithSignatureField(true))).toBe('signed')
  })

  it('入力欄だけ用意され、まだ署名されていないPDFは通常文書として扱う', async () => {
    expect(await detectDigitalSignature(await makePdfWithSignatureField(false))).toBe('none')
  })

  it('署名の有無を安全に調べられないデータは不明として扱う', async () => {
    expect(await detectDigitalSignature(new Uint8Array([1, 2, 3]))).toBe('unknown')
  })

  it('壊れた署名欄を署名なしと決めつけず、不明として警告対象にする', async () => {
    expect(await detectDigitalSignature(await makePdfWithSignatureField(true, true))).toBe('unknown')
  })
})

describe('FirstEditSignatureGuard（最初の編集前の警告）', () => {
  it('通常のPDFでは警告を出さない', async () => {
    const guard = new FirstEditSignatureGuard()
    const requestConfirmation = vi.fn()
    const edit = vi.fn().mockResolvedValue(true)

    expect(await guard.run('none', requestConfirmation, edit)).toBe(true)
    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(edit).toHaveBeenCalledOnce()
  })

  it('電子署名付きPDFで取り消した場合は編集を許可しない', async () => {
    const guard = new FirstEditSignatureGuard()
    const requestConfirmation = vi.fn().mockResolvedValue(false)
    const edit = vi.fn().mockResolvedValue(true)

    expect(await guard.run('signed', requestConfirmation, edit)).toBe(false)
    expect(requestConfirmation).toHaveBeenCalledOnce()
    expect(edit).not.toHaveBeenCalled()
  })

  it('編集が成功するまでは、次の編集でも警告する', async () => {
    const guard = new FirstEditSignatureGuard()
    const requestConfirmation = vi.fn().mockResolvedValue(true)

    expect(await guard.run('signed', requestConfirmation, async () => false)).toBe(false)
    expect(await guard.run('signed', requestConfirmation, async () => false)).toBe(false)
    expect(requestConfirmation).toHaveBeenCalledTimes(2)
  })

  it('編集成功を記録した後は、同じ文書で警告を繰り返さない', async () => {
    const guard = new FirstEditSignatureGuard()
    const requestConfirmation = vi.fn().mockResolvedValue(true)
    const edit = vi.fn().mockResolvedValue(true)

    expect(await guard.run('signed', requestConfirmation, edit)).toBe(true)
    expect(await guard.run('signed', requestConfirmation, edit)).toBe(true)
    expect(requestConfirmation).toHaveBeenCalledOnce()
    expect(edit).toHaveBeenCalledTimes(2)
  })

  it('署名確認が不明なPDFも、安全側に倒して警告する', async () => {
    const guard = new FirstEditSignatureGuard()
    const requestConfirmation = vi.fn().mockResolvedValue(false)
    const edit = vi.fn().mockResolvedValue(true)

    expect(await guard.run('unknown', requestConfirmation, edit)).toBe(false)
    expect(requestConfirmation).toHaveBeenCalledWith('unknown')
    expect(edit).not.toHaveBeenCalled()
  })

  it('確認後の編集が失敗した場合は、次の編集でも警告する', async () => {
    const guard = new FirstEditSignatureGuard()
    const requestConfirmation = vi.fn().mockResolvedValue(true)
    const failedEdit = vi.fn().mockRejectedValue(new Error('operation failed'))

    await expect(guard.run('signed', requestConfirmation, failedEdit)).rejects.toThrow()
    await expect(guard.run('signed', requestConfirmation, async () => true)).resolves.toBe(true)
    expect(requestConfirmation).toHaveBeenCalledTimes(2)
  })
})
