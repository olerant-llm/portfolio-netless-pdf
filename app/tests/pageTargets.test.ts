import { describe, expect, it } from 'vitest'
import { orderedTargets, singleSelectedPageNumber } from '../src/components/viewer/toolbar/pageTargets'

describe('pageTargets', () => {
  it('選んだ順ではなく元の並び順で返す', () => {
    expect(orderedTargets(['a', 'b', 'c'], new Set(['c', 'a']))).toEqual(['a', 'c'])
  })
  it('今の文書にないページIDは含めない', () => {
    expect(orderedTargets(['a'], new Set(['a', 'x']))).toEqual(['a'])
  })
  it('1枚だけ選んだときだけページ番号を返す', () => {
    expect(singleSelectedPageNumber(['a', 'b'], new Set(['b']))).toBe(2)
    expect(singleSelectedPageNumber(['a', 'b'], new Set(['a', 'b']))).toBeNull()
    expect(singleSelectedPageNumber(['a', 'b'], new Set())).toBeNull()
  })
})
