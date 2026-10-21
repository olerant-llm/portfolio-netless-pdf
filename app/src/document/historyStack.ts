/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * 「元に戻す」「やり直し」の履歴。
 *
 * 世代数ではなく合計サイズで上限を決める。大きなPDFで世代数だけ制限すると
 * メモリを食い潰すため（100MB × 10世代 = 1GB）。
 * 上限は元に戻す分とやり直し分の合計に掛ける（やり直しを足してもメモリを増やさない）。
 * 画面から独立させてあるので、自動テストで確かめられる。
 */

/** 履歴に積む1世代ぶんの中身 */
export interface HistoryEntry {
  bytes: Uint8Array
  pageIds: string[]
}

export interface History {
  /** 元に戻す側。末尾が直前の状態 */
  entries: HistoryEntry[]
  /** やり直し側。末尾が次に進める状態 */
  redo: HistoryEntry[]
  /** entries と redo の bytes の合計サイズ */
  totalBytes: number
  /** 上限を超えて捨てた古い段階の累計 */
  droppedCount: number
}

/** 履歴の合計サイズの上限（400MB）。これを超えたら古いものから捨てる */
export const HISTORY_BUDGET_BYTES = 400 * 1024 * 1024

export function createHistory(): History {
  return { entries: [], redo: [], totalBytes: 0, droppedCount: 0 }
}

export function canUndo(history: History): boolean {
  return history.entries.length > 0
}

export function canRedo(history: History): boolean {
  return history.redo.length > 0
}

const sizeOf = (entries: HistoryEntry[]) =>
  entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0)

/**
 * 上限を超えていたら、元に戻す側の古いものから捨てる。
 * **元に戻す側の最後の1件だけは必ず残す**
 * （1件だけで上限を超える巨大PDFでも「元に戻す」を使えるようにするため）。
 */
function trim(history: History, budget: number): History {
  const entries = [...history.entries]
  let { totalBytes, droppedCount } = history
  while (totalBytes > budget && entries.length > 1) {
    totalBytes -= entries.shift()!.bytes.byteLength
    droppedCount++
  }
  return { ...history, entries, totalBytes, droppedCount }
}

/**
 * 操作の「前」の状態を1世代積む。新しい操作をしたので、やり直し側は空にする。
 */
export function pushHistory(
  history: History,
  entry: HistoryEntry,
  budget: number = HISTORY_BUDGET_BYTES
): History {
  const entries = [...history.entries, entry]
  return trim({
    entries,
    redo: [],
    totalBytes: history.totalBytes - sizeOf(history.redo) + entry.bytes.byteLength,
    droppedCount: history.droppedCount,
  }, budget)
}

/** 次に pushHistory したとき、上限のために捨てられる古い段階の数 */
export function wouldDropHistory(
  history: History,
  addBytes: number,
  budget: number = HISTORY_BUDGET_BYTES
): number {
  let totalBytes = history.totalBytes - sizeOf(history.redo) + addBytes
  let remaining = history.entries.length + 1
  let dropped = 0
  while (totalBytes > budget && remaining > 1) {
    totalBytes -= history.entries[dropped].bytes.byteLength
    remaining--
    dropped++
  }
  return dropped
}

/**
 * 直前の状態を取り出す。無ければ null。
 * current（今の状態）を渡すと、やり直し側へ積む。
 */
export function undoHistory(
  history: History,
  current?: HistoryEntry,
  budget: number = HISTORY_BUDGET_BYTES
): { entry: HistoryEntry; history: History } | null {
  if (history.entries.length === 0) return null

  const entries = [...history.entries]
  const entry = entries.pop()!
  const redo = current ? [...history.redo, current] : history.redo
  const totalBytes = history.totalBytes - entry.bytes.byteLength
    + (current ? current.bytes.byteLength : 0)

  return {
    entry,
    history: trim({ ...history, entries, redo, totalBytes }, budget),
  }
}

/** 元に戻した状態を1つ進め直す。無ければ null。今の状態は元に戻す側へ積む */
export function redoHistory(
  history: History,
  current: HistoryEntry,
  budget: number = HISTORY_BUDGET_BYTES
): { entry: HistoryEntry; history: History } | null {
  if (history.redo.length === 0) return null

  const redo = [...history.redo]
  const entry = redo.pop()!
  const entries = [...history.entries, current]
  const totalBytes = history.totalBytes - entry.bytes.byteLength + current.bytes.byteLength

  return {
    entry,
    history: trim({ ...history, entries, redo, totalBytes }, budget),
  }
}
