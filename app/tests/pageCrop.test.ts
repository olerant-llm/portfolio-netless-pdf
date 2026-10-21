import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { makeTestPdf } from './helpers/makePdf'
import { cropPages } from '../src/utils/pageCrop'

/** 各ページの「幅×高さ」を返す */
async function pageSizes(bytes: Uint8Array): Promise<Array<[number, number]>> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())])
}

describe('cropPages', () => {
  it('四辺から指定した量だけ小さくなる', async () => {
    // makeTestPdf の高さは 400 で固定
    const pdf = await makeTestPdf([300])

    const result = await cropPages(pdf, [0], { left: 10, right: 20, top: 30, bottom: 40 })

    // 幅 300 - 10 - 20 = 270、高さ 400 - 30 - 40 = 330
    expect(await pageSizes(result)).toEqual([[270, 330]])
  })

  it('指定しなかったページは元の大きさのまま', async () => {
    const pdf = await makeTestPdf([300, 300])

    const result = await cropPages(pdf, [1], { left: 50, right: 50, top: 0, bottom: 0 })

    expect(await pageSizes(result)).toEqual([[300, 400], [200, 400]])
  })

  it('複数ページをまとめて切れる', async () => {
    const pdf = await makeTestPdf([300, 300, 300])

    const result = await cropPages(pdf, [0, 2], { left: 25, right: 25, top: 0, bottom: 0 })

    expect(await pageSizes(result)).toEqual([[250, 400], [300, 400], [250, 400]])
  })

  it('切る量が0なら大きさは変わらない', async () => {
    const pdf = await makeTestPdf([300])
    const result = await cropPages(pdf, [0], { left: 0, right: 0, top: 0, bottom: 0 })
    expect(await pageSizes(result)).toEqual([[300, 400]])
  })

  it('切りすぎてページが無くなる指定は、日本語のエラーで止まる', async () => {
    const pdf = await makeTestPdf([300])

    await expect(
      cropPages(pdf, [0], { left: 200, right: 200, top: 0, bottom: 0 })
    ).rejects.toThrow('切り取る量')
  })

  it('ページ番号が範囲外なら、日本語のエラーで止まる', async () => {
    const pdf = await makeTestPdf([300])

    await expect(
      cropPages(pdf, [5], { left: 10, right: 10, top: 10, bottom: 10 })
    ).rejects.toThrow('ページ番号')
  })

  it('切る量に負の数を指定したら、日本語のエラーで止まる', async () => {
    const pdf = await makeTestPdf([300])

    await expect(
      cropPages(pdf, [0], { left: -10, right: 0, top: 0, bottom: 0 })
    ).rejects.toThrow('0以上')
  })
})
