import { describe, it, expect } from 'vitest'
import {
  createHistory, pushHistory, undoHistory, redoHistory, canUndo, canRedo, wouldDropHistory,
} from '../src/document/historyStack'

/** 指定バイト数のダミーデータ */
const bytes = (n: number) => new Uint8Array(n)

describe('historyStack', () => {
  it('作った直後は元に戻せない', () => {
    const h = createHistory()
    expect(canUndo(h)).toBe(false)
  })

  it('1回積むと元に戻せる', () => {
    let h = createHistory()
    h = pushHistory(h, { bytes: bytes(10), pageIds: ['a'] }, 1000)
    expect(canUndo(h)).toBe(true)
  })

  it('元に戻すと、直前に積んだ内容が返る', () => {
    let h = createHistory()
    h = pushHistory(h, { bytes: bytes(10), pageIds: ['a', 'b'] }, 1000)
    const result = undoHistory(h)
    expect(result).not.toBeNull()
    expect(result!.entry.pageIds).toEqual(['a', 'b'])
    expect(canUndo(result!.history)).toBe(false)
  })

  it('元に戻すものが無ければ null が返る', () => {
    expect(undoHistory(createHistory())).toBeNull()
  })

  it('合計サイズが上限を超えたら、古いものから捨てる', () => {
    let h = createHistory()
    // 上限100バイト。60バイトを2つ積むと、古いほうが捨てられる
    h = pushHistory(h, { bytes: bytes(60), pageIds: ['古'] }, 100)
    h = pushHistory(h, { bytes: bytes(60), pageIds: ['新'] }, 100)

    const first = undoHistory(h)!
    expect(first.entry.pageIds).toEqual(['新'])
    expect(canUndo(first.history)).toBe(false) // 古いほうは残っていない
  })

  it('1件だけで上限を超える場合でも、その1件は残す（元に戻せないより良い）', () => {
    let h = createHistory()
    h = pushHistory(h, { bytes: bytes(500), pageIds: ['大'] }, 100)
    expect(canUndo(h)).toBe(true)
  })
})

describe('historyStack のやり直し', () => {
  const entry = (id: string, n = 10) => ({ bytes: bytes(n), pageIds: [id] })

  it('作った直後はやり直せない', () => {
    expect(canRedo(createHistory())).toBe(false)
  })

  it('元に戻す→やり直しで、元に戻す前の状態が返る', () => {
    let h = createHistory()
    h = pushHistory(h, entry('A'), 1000) // A の後に操作して、今は B
    const undone = undoHistory(h, entry('B'), 1000)!
    expect(undone.entry.pageIds).toEqual(['A'])
    expect(canRedo(undone.history)).toBe(true)

    const redone = redoHistory(undone.history, entry('A'), 1000)!
    expect(redone.entry.pageIds).toEqual(['B'])
    expect(canRedo(redone.history)).toBe(false)
    // やり直した後は、また元に戻せる
    expect(undoHistory(redone.history)!.entry.pageIds).toEqual(['A'])
  })

  it('2回戻して2回やり直すと、順番どおりに進む', () => {
    let h = createHistory()
    h = pushHistory(h, entry('A'), 1000)
    h = pushHistory(h, entry('B'), 1000) // 今は C
    const u1 = undoHistory(h, entry('C'), 1000)!        // → B
    const u2 = undoHistory(u1.history, u1.entry, 1000)! // → A
    expect(u2.entry.pageIds).toEqual(['A'])
    const r1 = redoHistory(u2.history, u2.entry, 1000)!
    expect(r1.entry.pageIds).toEqual(['B'])
    const r2 = redoHistory(r1.history, r1.entry, 1000)!
    expect(r2.entry.pageIds).toEqual(['C'])
  })

  it('元に戻した後に新しい操作をすると、やり直しは消える', () => {
    let h = createHistory()
    h = pushHistory(h, entry('A'), 1000)
    const undone = undoHistory(h, entry('B'), 1000)!
    const pushed = pushHistory(undone.history, entry('A'), 1000)
    expect(canRedo(pushed)).toBe(false)
    expect(pushed.totalBytes).toBe(10)
  })

  it('やり直せるものが無ければ null が返る', () => {
    expect(redoHistory(createHistory(), entry('A'), 1000)).toBeNull()
  })

  it('元に戻す分とやり直し分の合計で上限を守る', () => {
    let h = createHistory()
    h = pushHistory(h, entry('A', 40), 100)
    h = pushHistory(h, entry('B', 40), 100) // 今は C（60バイト）
    const undone = undoHistory(h, entry('C', 60), 100)!
    // 元に戻す側 A(40) + やり直し側 C(60) = 100 で上限ちょうど
    expect(undone.history.totalBytes).toBeLessThanOrEqual(100)
    expect(undone.entry.pageIds).toEqual(['B'])
    expect(canRedo(undone.history)).toBe(true)
  })

  it('古い段階を捨てた回数を数える', () => {
    let h = createHistory()
    h = pushHistory(h, entry('A', 60), 100)
    expect(h.droppedCount).toBe(0)
    h = pushHistory(h, entry('B', 60), 100)
    expect(h.droppedCount).toBe(1)
  })
})

describe('wouldDropHistory', () => {
  it('上限内なら0を返す', () => {
    let h = createHistory()
    h = pushHistory(h, { bytes: bytes(30), pageIds: ['A'] }, 100)
    expect(wouldDropHistory(h, 30, 100)).toBe(0)
  })

  it('次に積むと捨てられる古い段階の数を返す', () => {
    let h = createHistory()
    h = pushHistory(h, { bytes: bytes(40), pageIds: ['A'] }, 100)
    h = pushHistory(h, { bytes: bytes(40), pageIds: ['B'] }, 100)
    expect(wouldDropHistory(h, 40, 100)).toBe(1)
    expect(wouldDropHistory(h, 90, 100)).toBe(2)
  })

  it('捨てずに消えるやり直し分は数えない', () => {
    let h = createHistory()
    h = pushHistory(h, { bytes: bytes(40), pageIds: ['A'] }, 100)
    const undone = undoHistory(h, { bytes: bytes(50), pageIds: ['B'] }, 100)!
    // やり直し側の50バイトは新しい操作で消えるので、40バイト積んでも上限内
    expect(wouldDropHistory(undone.history, 40, 100)).toBe(0)
  })
})
