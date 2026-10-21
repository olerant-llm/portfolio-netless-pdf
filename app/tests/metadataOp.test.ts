import { describe, expect, it } from 'vitest'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
} from 'pdf-lib'

import {
  inspectMetadata,
  removePersonalMetadataOperation,
  updateMetadataOperation,
} from '../src/operations/metadataOp'
import { pageNumberOperation } from '../src/operations/pageNumberOp'
import { watermarkOperation } from '../src/operations/watermarkOp'
import {
  inspectFeatureRichPdf,
  makeFeatureRichPdf,
  makeTestPdf,
  pageWidths,
} from './helpers/makePdf'

const values = {
  title: '新しい題名',
  author: '作成者A',
  subject: '確認用の件名',
  keywords: '学校, PDF, 安全',
  creator: 'ネットレスPDF',
  producer: 'ローカル処理',
}

async function makePrivateMetadataPdf() {
  const doc = await PDFDocument.load(await makeFeatureRichPdf(), { updateMetadata: false })
  doc.setAuthor('PRIVATE-AUTHOR')
  doc.setSubject('PRIVATE-SUBJECT')
  doc.setKeywords(['PRIVATE-KEYWORD'])
  doc.setCreator('PRIVATE-CREATOR')
  doc.setProducer('PRIVATE-PRODUCER')
  doc.setCreationDate(new Date('2020-01-02T03:04:05Z'))
  doc.setModificationDate(new Date('2021-02-03T04:05:06Z'))

  const info = doc.context.lookup(doc.context.trailerInfo.Info, PDFDict)
  info.set(
    PDFName.of('CustomOwner'),
    doc.context.register(PDFHexString.fromText('PRIVATE-CUSTOM')),
  )
  const xmp = doc.context.stream(
    new TextEncoder().encode('<owner>PRIVATE-XMP</owner>'),
    { Type: 'Metadata', Subtype: 'XML' },
  )
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(xmp))
  doc.context.trailerInfo.ID = doc.context.obj([
    PDFHexString.fromText('PRIVATE-ID-1'),
    PDFHexString.fromText('PRIVATE-ID-2'),
  ])

  return doc.save({ useObjectStreams: false })
}

function allIndirectText(doc: PDFDocument): string {
  return doc.context.enumerateIndirectObjects().map(([, object]) => {
    if (object instanceof PDFHexString) return object.decodeText()
    if (object instanceof PDFRawStream) return object.getContentsString()
    return ''
  }).join('\n')
}

async function contentStreamCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const contents = doc.getPages()[0].node.Contents()
  if (!contents) return 0
  return contents instanceof PDFArray ? contents.size() : 1
}

describe('metadataOperation（文書情報）', () => {
  it('現在の文書情報を読む', async () => {
    const bytes = await makePrivateMetadataPdf()

    expect(await inspectMetadata(bytes)).toEqual(expect.objectContaining({
      title: 'Feature-rich test PDF',
      author: 'PRIVATE-AUTHOR',
      subject: 'PRIVATE-SUBJECT',
      keywords: 'PRIVATE-KEYWORD',
      creator: 'PRIVATE-CREATOR',
      producer: 'PRIVATE-PRODUCER',
      creationDate: '2020-01-02T03:04:05.000Z',
      modificationDate: '2021-02-03T04:05:06.000Z',
    }))
  })

  it('題名・作成者・件名・キーワード・作成ソフト・変換ソフトを編集する', async () => {
    const bytes = await makePrivateMetadataPdf()
    const r = await updateMetadataOperation(
      { bytes, pageIds: ['a', 'b', 'c'] },
      values,
    )

    expect(await inspectMetadata(r.bytes)).toEqual(expect.objectContaining(values))
    expect(r.pageIds).toEqual(['a', 'b', 'c'])
    expect(r.invalidated).toEqual([])
  })

  it('空にした項目は古い値を残さない', async () => {
    const bytes = await makePrivateMetadataPdf()
    const empty = Object.fromEntries(Object.keys(values).map((key) => [key, ''])) as typeof values
    const r = await updateMetadataOperation(
      { bytes, pageIds: ['a', 'b', 'c'] },
      empty,
    )

    expect(await inspectMetadata(r.bytes)).toEqual(expect.objectContaining(empty))
  })

  it('個人情報を消しても、しおり・リンク・注釈・入力欄・添付・ページラベルを保つ', async () => {
    const bytes = await makePrivateMetadataPdf()
    const before = await inspectFeatureRichPdf(bytes)
    const r = await removePersonalMetadataOperation(
      { bytes, pageIds: ['a', 'b', 'c'] },
    )
    const after = await inspectFeatureRichPdf(r.bytes)

    expect(after).toEqual({ ...before, title: undefined })
    expect(await pageWidths(r.bytes)).toEqual([101, 102, 103])
    expect(r.pageIds).toEqual(['a', 'b', 'c'])
    expect(r.invalidated).toEqual([])
  })

  it('個人情報の消去では標準項目・日時・独自項目・XMP・文書IDを残さない', async () => {
    const bytes = await makePrivateMetadataPdf()
    const r = await removePersonalMetadataOperation(
      { bytes, pageIds: ['a', 'b', 'c'] },
    )
    const metadata = await inspectMetadata(r.bytes)
    const doc = await PDFDocument.load(r.bytes, { updateMetadata: false })
    const info = doc.context.lookup(doc.context.trailerInfo.Info, PDFDict)

    expect(metadata).toEqual({
      title: '', author: '', subject: '', keywords: '', creator: '', producer: '',
      creationDate: undefined, modificationDate: undefined,
    })
    expect(info.keys()).toEqual([])
    expect(doc.catalog.has(PDFName.of('Metadata'))).toBe(false)
    expect(doc.context.trailerInfo.ID).toBeUndefined()
    expect(allIndirectText(doc)).not.toContain('PRIVATE-CUSTOM')
    expect(allIndirectText(doc)).not.toContain('PRIVATE-XMP')
  })

  it('透かし・ページ番号の後へ文書情報を反映しても、先の描画を残す', async () => {
    const bytes = await makeTestPdf([200])
    const watermarked = await watermarkOperation(
      { bytes, pageIds: ['a'] },
      { text: 'DRAFT', color: '#FF0000', opacity: 0.3, fontSize: 50, rotation: -45 },
    )
    const numbered = await pageNumberOperation(
      { bytes: watermarked.bytes, pageIds: watermarked.pageIds },
      { format: '{n}', startNumber: 1, position: 'bottom-center', color: '#000000', fontSize: 12 },
    )
    const beforeCount = await contentStreamCount(numbered.bytes)

    const edited = await updateMetadataOperation(
      { bytes: numbered.bytes, pageIds: numbered.pageIds },
      values,
    )

    expect(await contentStreamCount(edited.bytes)).toBe(beforeCount)
    expect(await inspectMetadata(edited.bytes)).toEqual(expect.objectContaining(values))
  })

  it('PDFと画面のページ数が違えば、日本語のお知らせで止まる', async () => {
    const bytes = await makeTestPdf([200, 300])

    await expect(updateMetadataOperation(
      { bytes, pageIds: ['a'] },
      values,
    )).rejects.toThrow('ページ数')
  })
})
