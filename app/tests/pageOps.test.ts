import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName } from 'pdf-lib'
import {
  inspectFeatureRichPdf,
  makeFeatureRichPdf,
  makeInheritedPageAttributesPdf,
  makeNestedOutlinePdf,
  makeTestPdf,
  pageWidths,
} from './helpers/makePdf'
import { reorderPages, deletePages, rotatePages, extractPages } from '../src/operations/pageOps'

/** ページの回転角を配列で返す */
async function pageRotations(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => p.getRotation().angle)
}

describe('reorderPages（並べ替え）', () => {
  it('指定した並びどおりに並べ替わる', async () => {
    const bytes = await makeTestPdf([101, 102, 103])
    const r = await reorderPages({ bytes, pageIds: ['a', 'b', 'c'] }, ['c', 'a', 'b'])

    expect(await pageWidths(r.bytes)).toEqual([103, 101, 102])
    expect(r.pageIds).toEqual(['c', 'a', 'b'])
  })

  it('見た目は変わらないので、描き直しは不要と申告する', async () => {
    const bytes = await makeTestPdf([101, 102])
    const r = await reorderPages({ bytes, pageIds: ['a', 'b'] }, ['b', 'a'])
    expect(r.invalidated).toEqual([])
  })

  it('元に無いページIDを指定したら、日本語のエラーで止まる', async () => {
    const bytes = await makeTestPdf([101])
    await expect(reorderPages({ bytes, pageIds: ['a'] }, ['x'])).rejects.toThrow('ページ')
  })

  it('ページ数が合わない並びを指定したら、日本語のエラーで止まる', async () => {
    const bytes = await makeTestPdf([101, 102])
    await expect(reorderPages({ bytes, pageIds: ['a', 'b'] }, ['a'])).rejects.toThrow('ページ')
  })

  it('同じページが2回出てくる並びは、日本語のエラーで止まる', async () => {
    // 枚数は合っているが 'b' が消えて 'a' が2枚になる並び。
    // ドラッグ処理の作り込みミスで起きやすく、通すとページIDが重複して画面が壊れる
    const bytes = await makeTestPdf([101, 102])
    await expect(reorderPages({ bytes, pageIds: ['a', 'b'] }, ['a', 'a'])).rejects.toThrow('ページ')
  })

  it('文書情報・しおり・リンク・注釈・入力欄・添付・ページラベルをページ内容に結び付けたまま保つ', async () => {
    const bytes = await makeFeatureRichPdf()
    const r = await reorderPages({ bytes, pageIds: ['a', 'b', 'c'] }, ['c', 'a', 'b'])
    const summary = await inspectFeatureRichPdf(r.bytes)

    expect(summary.title).toBe('Feature-rich test PDF')
    expect(summary.outlineTargets).toEqual([2, 0])
    expect(summary.danglingOutlineCount).toBe(0)
    expect(summary.internalLinkTargets).toEqual([
      { from: 1, to: 2 }, { from: 1, to: 0 }, { from: 1, to: 0 },
    ])
    expect(summary.danglingInternalLinkCount).toBe(0)
    expect(summary.externalLinks).toEqual(['https://example.test/'])
    expect(summary.noteCount).toBe(1)
    expect(summary.fieldNames).toEqual(['kept-field', 'multi-page-field', 'page-b-field'])
    expect(summary.hasAttachment).toBe(true)
    expect(summary.pageLabels).toEqual(['C', 'A', 'B'])
  })

  it('ページ木の親から受け継いだ寸法・回転・描画部品を保つ', async () => {
    const bytes = await makeInheritedPageAttributesPdf()
    const r = await reorderPages({ bytes, pageIds: ['a', 'b'] }, ['b', 'a'])
    const doc = await PDFDocument.load(r.bytes)

    expect(doc.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([
      [321, 654], [321, 654],
    ])
    expect(doc.getPages().map((page) => page.getRotation().angle)).toEqual([90, 90])
    expect(doc.getPages().every((page) => page.node.has(PDFName.Resources))).toBe(true)
  })
})

describe('deletePages（削除）', () => {
  it('指定したページが消える', async () => {
    const bytes = await makeTestPdf([101, 102, 103])
    const r = await deletePages({ bytes, pageIds: ['a', 'b', 'c'] }, ['b'])

    expect(await pageWidths(r.bytes)).toEqual([101, 103])
    expect(r.pageIds).toEqual(['a', 'c'])
    expect(r.invalidated).toEqual([])
  })

  it('複数まとめて消せる', async () => {
    const bytes = await makeTestPdf([101, 102, 103, 104])
    const r = await deletePages({ bytes, pageIds: ['a', 'b', 'c', 'd'] }, ['a', 'c'])
    expect(await pageWidths(r.bytes)).toEqual([102, 104])
  })

  it('全ページを消そうとしたら、日本語のエラーで止まる', async () => {
    const bytes = await makeTestPdf([101, 102])
    await expect(
      deletePages({ bytes, pageIds: ['a', 'b'] }, ['a', 'b'])
    ).rejects.toThrow('すべてのページ')
  })

  it('1ページも指定しなければ、そのまま', async () => {
    const bytes = await makeTestPdf([101, 102])
    const r = await deletePages({ bytes, pageIds: ['a', 'b'] }, [])
    expect(r.pageIds).toEqual(['a', 'b'])
  })

  it('残る情報を保ち、消したページだけのしおり・入力欄・ラベルを残さない', async () => {
    const bytes = await makeFeatureRichPdf()
    const r = await deletePages({ bytes, pageIds: ['a', 'b', 'c'] }, ['b'])
    const summary = await inspectFeatureRichPdf(r.bytes)

    expect(summary.title).toBe('Feature-rich test PDF')
    expect(summary.outlineTargets).toEqual([1])
    expect(summary.danglingOutlineCount).toBe(0)
    expect(summary.internalLinkTargets).toEqual([{ from: 0, to: 1 }, { from: 0, to: 1 }])
    expect(summary.danglingInternalLinkCount).toBe(0)
    expect(summary.externalLinks).toEqual(['https://example.test/'])
    expect(summary.noteCount).toBe(1)
    expect(summary.fieldNames).toEqual(['kept-field', 'multi-page-field'])
    expect(summary.fieldWidgetPages['multi-page-field']).toEqual([0])
    expect(summary.hasAttachment).toBe(true)
    expect(summary.pageLabels).toEqual(['A', 'C'])
  })

  it('名前付きリンク先のページを消すと、リンク・しおり・名前一覧を一緒に除く', async () => {
    const bytes = await makeFeatureRichPdf()
    const r = await deletePages({ bytes, pageIds: ['a', 'b', 'c'] }, ['c'])
    const summary = await inspectFeatureRichPdf(r.bytes)

    expect(summary.internalLinkTargets).toEqual([{ from: 0, to: 1 }])
    expect(summary.danglingInternalLinkCount).toBe(0)
    expect(summary.outlineTargets).toEqual([1])
    expect(summary.danglingOutlineCount).toBe(0)
    expect(summary.namedDestinationNames).toEqual([])
  })

  it('消すページの親しおりを除き、残るページの子しおりを一段上へ移す', async () => {
    const bytes = await makeNestedOutlinePdf()
    const r = await deletePages({ bytes, pageIds: ['a', 'b', 'c'] }, ['b'])
    const summary = await inspectFeatureRichPdf(r.bytes)

    expect(summary.outlineTargets).toEqual([1])
    expect(summary.outlineEntries).toEqual([{ title: 'Kept child', depth: 0 }])
    expect(summary.outlineCount).toBe(1)
    expect(summary.danglingOutlineCount).toBe(0)
  })
})

describe('rotatePages（回転）', () => {
  it('指定したページだけ回る', async () => {
    const bytes = await makeTestPdf([101, 102])
    const r = await rotatePages({ bytes, pageIds: ['a', 'b'] }, ['b'], 90)

    expect(await pageRotations(r.bytes)).toEqual([0, 90])
    expect(r.pageIds).toEqual(['a', 'b'])
  })

  it('回したページは描き直しが必要と申告する', async () => {
    const bytes = await makeTestPdf([101, 102])
    const r = await rotatePages({ bytes, pageIds: ['a', 'b'] }, ['b'], 90)
    expect(r.invalidated).toEqual(['b'])
  })

  it('360度を超えたら0に戻る', async () => {
    const bytes = await makeTestPdf([101])
    let r = await rotatePages({ bytes, pageIds: ['a'] }, ['a'], 270)
    r = await rotatePages({ bytes: r.bytes, pageIds: r.pageIds }, ['a'], 90)
    expect(await pageRotations(r.bytes)).toEqual([0])
  })

  it('マイナス方向にも回せる', async () => {
    const bytes = await makeTestPdf([101])
    const r = await rotatePages({ bytes, pageIds: ['a'] }, ['a'], -90)
    expect(await pageRotations(r.bytes)).toEqual([270])
  })
})

describe('extractPages（選んだページを取り出す）', () => {
  it('選んだページだけのデータを返す', async () => {
    const bytes = await makeTestPdf([101, 102, 103])
    const out = await extractPages({ bytes, pageIds: ['a', 'b', 'c'] }, ['a', 'c'])
    expect(await pageWidths(out)).toEqual([101, 103])
  })

  it('選んだ順ではなく、元の並び順で取り出す', async () => {
    const bytes = await makeTestPdf([101, 102, 103])
    const out = await extractPages({ bytes, pageIds: ['a', 'b', 'c'] }, ['c', 'a'])
    expect(await pageWidths(out)).toEqual([101, 103])
  })

  it('1ページも選ばなければ、日本語のエラーで止まる', async () => {
    const bytes = await makeTestPdf([101])
    await expect(extractPages({ bytes, pageIds: ['a'] }, [])).rejects.toThrow('ページ')
  })
})
