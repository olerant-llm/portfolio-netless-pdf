import { describe, it, expect } from 'vitest'
import { makeTestPdf, pageWidths, pageHeights } from './helpers/makePdf'
import { cropOperation } from '../src/operations/cropOp'

/** 四辺から10ptずつ切る指定 */
const margins = { left: 10, right: 10, top: 10, bottom: 10 }

describe('cropOperation（トリミング）', () => {
  it('ページを選んでいなければ、すべてのページを切る', async () => {
    const bytes = await makeTestPdf([200, 300])
    const r = await cropOperation({ bytes, pageIds: ['a', 'b'] }, [], margins)

    expect(await pageWidths(r.bytes)).toEqual([180, 280])
    expect(await pageHeights(r.bytes)).toEqual([380, 380])
  })

  it('選んだページだけを切る', async () => {
    const bytes = await makeTestPdf([200, 300])
    const r = await cropOperation({ bytes, pageIds: ['a', 'b'] }, ['b'], margins)

    expect(await pageWidths(r.bytes)).toEqual([200, 280])
    expect(await pageHeights(r.bytes)).toEqual([400, 380])
  })

  it('ページの並びは変わらない', async () => {
    const bytes = await makeTestPdf([200, 300])
    const r = await cropOperation({ bytes, pageIds: ['a', 'b'] }, ['b'], margins)
    expect(r.pageIds).toEqual(['a', 'b'])
  })

  it('切ったページは絵を描き直すと申告する', async () => {
    const bytes = await makeTestPdf([200, 300])
    const r = await cropOperation({ bytes, pageIds: ['a', 'b'] }, ['b'], margins)
    expect(r.invalidated).toEqual(['b'])
  })

  it('ページを選んでいなければ、全ページを描き直すと申告する', async () => {
    const bytes = await makeTestPdf([200, 300])
    const r = await cropOperation({ bytes, pageIds: ['a', 'b'] }, [], margins)
    expect(r.invalidated).toEqual(['a', 'b'])
  })

  it('切る量が大きすぎたら、日本語のお知らせで止まる', async () => {
    const bytes = await makeTestPdf([200])
    await expect(
      cropOperation({ bytes, pageIds: ['a'] }, ['a'], { left: 150, right: 150, top: 0, bottom: 0 })
    ).rejects.toThrow('ページが残りません')
  })

  it('元に無いページIDを指定したら、日本語のお知らせで止まる', async () => {
    const bytes = await makeTestPdf([200])
    await expect(cropOperation({ bytes, pageIds: ['a'] }, ['x'], margins)).rejects.toThrow('ページ')
  })
})
