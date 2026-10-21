import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { exportSelectedPages } from '../src/exports/pagesExport'
import { makeTestPdf, pageWidths } from './helpers/makePdf'

describe('exportSelectedPages（選択ページの書き出し）', () => {
  it('選択ページを元の並び順で1つのPDFにする', async () => {
    const bytes = await makeTestPdf([101, 102, 103])
    const before = bytes.slice()
    const result = await exportSelectedPages(
      { bytes, pageIds: ['a', 'b', 'c'] },
      ['c', 'a'],
      'single',
      '確認用',
    )

    expect(result.fileName).toBe('確認用-選択ページ.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(await pageWidths(result.bytes)).toEqual([101, 103])
    expect(bytes).toEqual(before)
  })

  it('選択ページを1ページずつPDFにしてZIPへ入れる', async () => {
    const bytes = await makeTestPdf([101, 102, 103])
    const result = await exportSelectedPages(
      { bytes, pageIds: ['a', 'b', 'c'] },
      ['c', 'a'],
      'separate',
      '確認用',
    )
    const zip = await JSZip.loadAsync(result.bytes)
    const names = Object.keys(zip.files)

    expect(result.fileName).toBe('確認用-選択ページ.zip')
    expect(result.mimeType).toBe('application/zip')
    expect(names).toEqual(['確認用-ページ001.pdf', '確認用-ページ003.pdf'])
    expect(await pageWidths(await zip.file(names[0])!.async('uint8array'))).toEqual([101])
    expect(await pageWidths(await zip.file(names[1])!.async('uint8array'))).toEqual([103])
  })

  it('選択が空または存在しないページなら日本語で止める', async () => {
    const bytes = await makeTestPdf([101])
    const input = { bytes, pageIds: ['a'] }

    await expect(exportSelectedPages(input, [], 'single', '確認用')).rejects.toThrow('選択')
    await expect(exportSelectedPages(input, ['x'], 'single', '確認用')).rejects.toThrow('見つかりません')
  })

  it('ファイル名に使えない記号をZIP内にも残さない', async () => {
    const bytes = await makeTestPdf([101])
    const result = await exportSelectedPages(
      { bytes, pageIds: ['a'] }, ['a'], 'separate', '../危険:*?',
    )
    const zip = await JSZip.loadAsync(result.bytes)
    expect(result.fileName).toBe('.._危険___-選択ページ.zip')
    expect(Object.keys(zip.files)).toEqual(['.._危険___-ページ001.pdf'])
  })
})
