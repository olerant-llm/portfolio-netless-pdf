import { describe, expect, it } from 'vitest'
import { makeTestPng } from './helpers/makePdf'
import {
  appendImageFiles,
  moveImageDraft,
  type ImageDraft,
} from '../src/components/viewer/newImagePdf'

const draft = (id: string): ImageDraft => ({
  id,
  name: `${id}.png`,
  bytes: makeTestPng(),
  previewUrl: `blob:${id}`,
})

describe('画像から新しいPDFを作る準備', () => {
  it('選択した順番を保ったまま画像を読み込む', async () => {
    const files = ['1.png', '2.png'].map((name) => ({
      name,
      arrayBuffer: async () => makeTestPng().buffer,
    }))

    const result = await appendImageFiles([], files, (file) => `blob:${file.name}`)

    expect(result.map((item) => item.name)).toEqual(['1.png', '2.png'])
  })

  it('後から追加した画像は、今の一覧の後ろへ足す', async () => {
    const result = await appendImageFiles(
      [draft('先')],
      [{ name: '後.png', arrayBuffer: async () => makeTestPng().buffer }],
      () => 'blob:後',
    )

    expect(result.map((item) => item.name)).toEqual(['先.png', '後.png'])
  })

  it('画像の並べ替え結果を返し、元の一覧は変えない', () => {
    const before = [draft('a'), draft('b'), draft('c')]
    const after = moveImageDraft(before, 'c', 'a')

    expect(after.map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(before.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('一覧に無い画像を動かそうとしたら何も変えない', () => {
    const before = [draft('a'), draft('b')]
    expect(moveImageDraft(before, 'x', 'a')).toBe(before)
  })
})
