import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { PDF } from '@libpdf/core'
import { inspectFeatureRichPdf, makeFeatureRichPdf, makeTestPdf } from './helpers/makePdf'
import {
  classifyPdfEditingProtection,
  protectPdfBytes,
  removePdfProtection,
} from '../src/security/pdfProtection'

async function makeProtectedPdf(
  userPassword = 'view-pass',
  ownerPassword = 'owner-pass',
  permissions: Parameters<PDF['setProtection']>[0]['permissions'] = {},
) {
  const pdf = await PDF.load(await makeTestPdf([101, 102]))
  pdf.setProtection({ algorithm: 'AES-256', userPassword, ownerPassword, permissions })
  return await pdf.save()
}

async function loadEncryptionFixture(name: string) {
  return new Uint8Array(await readFile(new URL(`./fixtures/encryption/${name}`, import.meta.url)))
}

describe('PDFの編集保護の判定', () => {
  it('保護されていない通常PDFは、そのまま編集できる', () => {
    expect(classifyPdfEditingProtection(null)).toBe('none')
  })

  it('文科省PDFと同じ権限では、電子署名ではなく編集制限として扱う', () => {
    expect(classifyPdfEditingProtection([4, 16, 512, 2048])).toBe('restricted')
  })

  it('暗号化されているPDFは、変更権限があっても保護解除を先に行う', () => {
    expect(classifyPdfEditingProtection([4, 8, 16, 32, 256, 512, 1024, 2048])).toBe('protected')
  })
})

describe('removePdfProtection（パスワード解除）', () => {
  for (const [algorithm, fixture, password] of [
    ['RC4-40', 'PasswordSample-40bit.pdf', 'owner'],
    ['RC4-128', 'PasswordSample-128bit.pdf', 'owner'],
    ['AES-256', 'PasswordSample-256bit.pdf', 'owner'],
  ] as const) {
    it(`${algorithm}で保護された公式試験PDFを、通常のPDFへ戻す`, async () => {
      const result = await removePdfProtection(await loadEncryptionFixture(fixture), password)

      const reopened = await PDF.load(result)
      expect(reopened.isEncrypted).toBe(false)
      expect(reopened.getPageCount()).toBeGreaterThan(0)
    })
  }

  it('一部でも復号に失敗したPDFは、解除済みとして返さない', async () => {
    const protectedBytes = await loadEncryptionFixture('issue17069.pdf')

    await expect(removePdfProtection(protectedBytes, '')).rejects.toThrow('安全確認')
  })

  it('未合格のAES-128方式は、画面で解除できるものとして扱わない', async () => {
    const protectedBytes = await loadEncryptionFixture('issue17069.pdf')

    await expect(removePdfProtection(protectedBytes, '')).rejects.toThrow()
  })

  it('閲覧用パスワードでも、変更が許可されたPDFなら解除できる', async () => {
    const protectedBytes = await makeProtectedPdf()
    const result = await removePdfProtection(protectedBytes, 'view-pass')

    expect((await PDF.load(result)).isEncrypted).toBe(false)
  })

  it('印刷制限だけで閲覧用パスワードがないPDFも解除できる', async () => {
    const protectedBytes = await makeProtectedPdf('', 'owner-pass', { print: false })
    const result = await removePdfProtection(protectedBytes, '')

    expect((await PDF.load(result)).isEncrypted).toBe(false)
  })

  it('誤ったパスワードは日本語の理由で拒否する', async () => {
    const protectedBytes = await makeProtectedPdf()

    await expect(removePdfProtection(protectedBytes, 'wrong-pass')).rejects.toThrow('パスワード')
  })

  it('閲覧用パスワードに変更権限がなければ、所有者用パスワードを案内する', async () => {
    const protectedBytes = await loadEncryptionFixture('PasswordSample-40bit.pdf')

    await expect(removePdfProtection(protectedBytes, 'user')).rejects.toThrow('所有者')
  })
})

describe('protectPdfBytes（AES-256保護）', () => {
  it('AES-256で保護し、正しいパスワードだけで開ける', async () => {
    const original = await makeTestPdf([101, 102])
    const protectedBytes = await protectPdfBytes(original, 'view-pass')

    expect((await PDF.load(protectedBytes)).isAuthenticated).toBe(false)
    expect((await PDF.load(protectedBytes, { credentials: 'wrong-pass' })).isAuthenticated).toBe(false)
    const reopened = await PDF.load(protectedBytes, { credentials: 'view-pass' })
    expect(reopened.getSecurity().algorithm).toBe('AES-256')
  })

  it('空のパスワードでは保護しない', async () => {
    await expect(protectPdfBytes(await makeTestPdf([101]), '')).rejects.toThrow('パスワード')
  })

  it('パスワード付きデータを作っても、編集中の元データは書き換えない', async () => {
    const original = await makeTestPdf([101, 102])
    const before = original.slice()
    const protectedBytes = await protectPdfBytes(original, 'view-pass')

    expect(original).toEqual(before)
    expect((await PDF.load(original)).isEncrypted).toBe(false)
    expect((await PDF.load(protectedBytes, { credentials: 'view-pass' })).isEncrypted).toBe(true)
  })

  it('UTF-8で127バイトを超えるパスワードは、後ろを切らず日本語で拒否する', async () => {
    const original = await makeTestPdf([101])

    await expect(protectPdfBytes(original, 'a'.repeat(128))).rejects.toThrow('127バイト')
    await expect(protectPdfBytes(original, 'あ'.repeat(43))).rejects.toThrow('127バイト')
  })

  it('UTF-8で127バイトちょうどのパスワードは使用できる', async () => {
    const password = 'a'.repeat(127)
    const protectedBytes = await protectPdfBytes(await makeTestPdf([101]), password)

    expect((await PDF.load(protectedBytes, { credentials: password })).isAuthenticated).toBe(true)
  })

  it('保護して解除した後も、しおり・文書情報・リンク・入力欄・添付を保つ', async () => {
    const original = await makeFeatureRichPdf()
    const protectedBytes = await protectPdfBytes(original, 'view-pass')
    const unprotectedBytes = await removePdfProtection(protectedBytes, 'view-pass')
    const summary = await inspectFeatureRichPdf(unprotectedBytes)

    expect(summary.title).toBe('Feature-rich test PDF')
    expect(summary.outlineTargets).toEqual([1, 2])
    expect(summary.internalLinkTargets).toEqual([
      { from: 0, to: 1 }, { from: 0, to: 2 }, { from: 0, to: 2 },
    ])
    expect(summary.danglingOutlineCount).toBe(0)
    expect(summary.danglingInternalLinkCount).toBe(0)
    expect(summary.externalLinks).toEqual(['https://example.test/'])
    expect(summary.noteCount).toBe(1)
    expect(summary.fieldNames).toEqual(['kept-field', 'multi-page-field', 'page-b-field'])
    expect(summary.hasAttachment).toBe(true)
    expect(summary.pageLabels).toEqual(['A', 'B', 'C'])
  })
})
