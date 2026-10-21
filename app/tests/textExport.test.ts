import { describe, expect, it, vi } from 'vitest'

import { extractPdfText } from '../src/exports/textExport'

function fakePdf(pages: Array<Array<{ str?: string, hasEOL?: boolean }>>) {
  return {
    numPages: pages.length,
    getPage: vi.fn(async (pageNumber: number) => ({
      getTextContent: vi.fn(async () => ({ items: pages[pageNumber - 1] })),
    })),
  }
}

describe('extractPdfText（文字の取り出し）', () => {
  it('選択ページを文書順に読み、改行とページ見出しを付ける', async () => {
    const pdf = fakePdf([
      [{ str: '一行目', hasEOL: true }, { str: '二行目' }],
      [{ str: '対象外' }],
      [{ str: '三枚目' }],
    ])
    const progress: number[] = []
    const result = await extractPdfText(pdf, ['a', 'b', 'c'], ['c', 'a'], (value) => {
      progress.push(value.percent)
    })

    expect(result.pageCount).toBe(2)
    expect(result.hasText).toBe(true)
    expect(result.text).toContain('--- 1ページ目 ---\n一行目\n二行目')
    expect(result.text).toContain('--- 3ページ目 ---\n三枚目')
    expect(result.text).not.toContain('対象外')
    expect(progress).toEqual([50, 100])
  })

  it('文字のない画像PDFは空として判定する', async () => {
    const result = await extractPdfText(fakePdf([[]]), ['a'], ['a'])
    expect(result.hasText).toBe(false)
    expect(result.text).toBe('--- 1ページ目 ---\n\n')
  })

  it('選択なしと存在しないページは日本語で止める', async () => {
    const pdf = fakePdf([[{ str: '本文' }]])
    await expect(extractPdfText(pdf, ['a'], [])).rejects.toThrow('選択')
    await expect(extractPdfText(pdf, ['a'], ['x'])).rejects.toThrow('見つかりません')
  })
})
