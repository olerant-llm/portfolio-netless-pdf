/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import {
  createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode,
} from 'react'
import { loadPdfFromBytes } from '../utils/pdfHelpers'
import {
  createHistory, pushHistory, undoHistory, redoHistory, canUndo, canRedo, wouldDropHistory, History, HistoryEntry,
} from './historyStack'
import { newPageId } from './pageId'
import { OperationError, OperationInput, OperationResult } from '../operations/types'
import {
  detectDigitalSignature,
  DigitalSignatureStatus,
  FirstEditSignatureGuard,
} from './digitalSignature'
import { detectPdfEditingProtection } from '../security/pdfProtection'

/** 開いている文書の状態 */
export interface DocumentState {
  /** 今の中身。操作するたびに新しくなる */
  bytes: Uint8Array
  /** ページの並び。中身はページID（位置ではなく、そのページ自身を指す目印） */
  pageIds: string[]
  /** 表示しているファイル名（拡張子なし） */
  name: string
  /** 表示用の読み込み結果。bytes が変わるたび作り直す */
  pdfDoc: any
  /** 保存していない変更があるか */
  isDirty: boolean
  /** 証明書による電子署名の有無。確認できない場合も警告対象にする */
  digitalSignatureStatus: DigitalSignatureStatus
}

/** 開けなかった理由。画面側が日本語のお知らせを選ぶのに使う */
export type OpenFailureReason =
  | 'password-protected'
  | 'editing-restricted'
  | 'editing-protected'
  | 'broken'

export interface OpenFailureState {
  reason: OpenFailureReason
  /** 最初に選んだデータ。修復や解除に失敗しても別のデータへ置き換えない */
  bytes: Uint8Array
  name: string
}

export class OpenDocumentError extends Error {
  constructor(public reason: OpenFailureReason) {
    super(reason)
    this.name = 'OpenDocumentError'
  }
}

// ページIDを作る処理は pageId.ts にある（操作の側からも使うため）。
// ここから読み込めるように、これまでどおりの名前で再び外へ出しておく
export { newPageId }

/**
 * pdfjs の読み込み結果を捨てる。
 * 捨て損ねると、PDFデータ本体と描画済みページの控えを抱えたまま積み上がる。
 */
export function releasePdf(pdfDoc: any) {
  try {
    pdfDoc?.destroy?.()
  } catch {
    // 破棄の失敗は無視してよい（すでに壊れている場合など）
  }
}

/** 保護情報を読めなかった場合も、開きかけのPDFを残さない。 */
export async function detectPdfEditingProtectionSafely(pdfDoc: any) {
  try {
    return await detectPdfEditingProtection(pdfDoc)
  } catch (error) {
    releasePdf(pdfDoc)
    throw error
  }
}

export interface OpenDocumentOptions {
  /** 新しく作った文書など、まだ一度も保存していないときに指定する */
  isDirty?: boolean
  /** 修復・解除後の再読込に失敗したときも保持する、最初のデータ */
  failureSource?: Pick<OpenFailureState, 'bytes' | 'name'>
}

/**
 * 操作には現在のデータの複製を渡し、返ってきたPDFを実際に開けるところまで確認する。
 * ここが成功する前は、画面・履歴・未保存状態を一切変えない。
 */
export async function prepareOperationResult(
  current: OperationInput,
  run: (input: OperationInput) => Promise<OperationResult>,
) {
  const result = await run({
    bytes: current.bytes.slice(),
    pageIds: [...current.pageIds],
  })
  const pdfDoc = await loadPdfFromBytes(result.bytes)
  const uniquePageIds = new Set(result.pageIds)
  if (pdfDoc.numPages !== result.pageIds.length || uniquePageIds.size !== result.pageIds.length) {
    releasePdf(pdfDoc)
    throw new OperationError('操作後のページ情報が一致しないため、変更を取り消しました。')
  }
  return { result, pdfDoc }
}

// ============================================================
// 入れ物は2つに分ける。
//   DocumentContext  … 文書の中身と操作。操作したときだけ変わる
//   ThumbnailContext … ページの絵。1枚描けるたびに変わる
// 1つにまとめると、絵が1枚描けるたびに全ページの部品が動き直す。
// ============================================================

interface DocumentContextType {
  doc: DocumentState | null
  /** 文書を開き直す・閉じるたびに変わる番号。操作では変わらない */
  documentKey: number
  /** 処理中か（操作中はボタンを押させない） */
  isBusy: boolean
  /** 元に戻せるか */
  canUndo: boolean
  /** やり直せるか */
  canRedo: boolean
  /** 上限のため古い段階を捨てた後なら、今元に戻せる回数。捨てていなければ null */
  undoLimit: number | null
  /** 失敗したら OpenDocumentError を投げる */
  openDocument: (bytes: Uint8Array, name: string, options?: OpenDocumentOptions) => Promise<void>
  openFailure: OpenFailureState | null
  dismissOpenFailure: () => void
  closeDocument: () => void
  /** 操作を1つ適用する。失敗したら例外を投げる（呼び出し側で日本語のお知らせを出す） */
  /** 反映できたときだけ true。警告で中止・二重実行・文書切替時は false */
  applyOperation: (run: (input: OperationInput) => Promise<OperationResult>) => Promise<boolean>
  undo: () => Promise<void>
  redo: () => Promise<void>
  /** 古い段階が捨てられる前の確認。捨てられる数。不要なときは null */
  historyWarningDrops: number | null
  /** 古い段階が捨てられる前の確認に対する利用者の判断を返す */
  answerHistoryWarning: (proceed: boolean) => void
  /** 保存した直後に呼ぶ。「保存していない変更」の印を消す */
  markSaved: () => void
  /** 最初の編集前に表示する電子署名警告。不要なときは null */
  signatureWarningStatus: Exclude<DigitalSignatureStatus, 'none'> | null
  /** 電子署名警告に対する利用者の判断を返す */
  answerSignatureWarning: (proceed: boolean) => void
}

interface ThumbnailContextType {
  /** ページIDごとの絵。まだ描いていないページは入っていない */
  thumbnails: Map<string, string>
  /** 描いた絵を覚えさせる */
  setThumbnail: (pageId: string, dataUrl: string) => void
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined)
const ThumbnailContext = createContext<ThumbnailContextType | undefined>(undefined)

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<DocumentState | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [undoAvailable, setUndoAvailable] = useState(false)
  const [redoAvailable, setRedoAvailable] = useState(false)
  const [undoLimit, setUndoLimit] = useState<number | null>(null)
  const [historyWarningDrops, setHistoryWarningDrops] = useState<number | null>(null)
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map())
  const [signatureWarningStatus, setSignatureWarningStatus] = useState<
    Exclude<DigitalSignatureStatus, 'none'> | null
  >(null)
  const [openFailure, setOpenFailure] = useState<OpenFailureState | null>(null)
  const [documentKey, setDocumentKey] = useState(0)

  // 操作の中から見る値はすべて ref でも持つ。
  // 状態変数だけだと、関数が「作られた時点の値」を握り込み、
  // 連続操作で1回目の結果が消える。
  const docRef = useRef<DocumentState | null>(null)
  const busyRef = useRef(false)
  const historyRef = useRef<History>(createHistory())
  const signatureGuardRef = useRef(new FirstEditSignatureGuard())
  const signatureDecisionRef = useRef<((proceed: boolean) => void) | null>(null)
  const historyDecisionRef = useRef<((proceed: boolean) => void) | null>(null)
  /** 古い段階が捨てられる確認は、1つの文書につき最初の1回だけ出す */
  const historyWarnedRef = useRef(false)

  const setHistory = useCallback((next: History) => {
    historyRef.current = next
    setUndoAvailable(canUndo(next))
    setRedoAvailable(canRedo(next))
    setUndoLimit(next.droppedCount > 0 ? next.entries.length : null)
  }, [])

  const setDocument = useCallback((next: DocumentState | null) => {
    docRef.current = next
    setDoc(next)
  }, [])

  const setBusy = useCallback((value: boolean) => {
    busyRef.current = value
    setIsBusy(value)
  }, [])

  const answerSignatureWarning = useCallback((proceed: boolean) => {
    const resolve = signatureDecisionRef.current
    signatureDecisionRef.current = null
    setSignatureWarningStatus(null)
    resolve?.(proceed)
  }, [])

  const requestSignatureWarning = useCallback((status: Exclude<DigitalSignatureStatus, 'none'>) => (
    new Promise<boolean>((resolve) => {
      // applyOperation 側でも二重実行を防ぐが、未解決の確認を上書きしない安全網も置く。
      if (signatureDecisionRef.current) {
        resolve(false)
        return
      }
      signatureDecisionRef.current = resolve
      setSignatureWarningStatus(status)
    })
  ), [])

  const answerHistoryWarning = useCallback((proceed: boolean) => {
    const resolve = historyDecisionRef.current
    historyDecisionRef.current = null
    setHistoryWarningDrops(null)
    resolve?.(proceed)
  }, [])

  const requestHistoryWarning = useCallback((drops: number) => (
    new Promise<boolean>((resolve) => {
      if (historyDecisionRef.current) {
        resolve(false)
        return
      }
      historyDecisionRef.current = resolve
      setHistoryWarningDrops(drops)
    })
  ), [])

  const openDocument = useCallback(async (
    bytes: Uint8Array,
    name: string,
    options?: OpenDocumentOptions,
  ) => {
    if (busyRef.current) return
    setBusy(true)
    try {
      let pdfDoc: any
      try {
        pdfDoc = await loadPdfFromBytes(bytes)
      } catch (err: any) {
        const reason: OpenFailureReason = err?.name === 'PasswordException'
          ? 'password-protected'
          : 'broken'
        const source = options?.failureSource ?? { bytes, name }
        setOpenFailure({ reason, bytes: source.bytes, name: source.name })
        if (reason === 'password-protected') throw new OpenDocumentError(reason)
        console.error('PDFを開けませんでした:', err)
        throw new OpenDocumentError(reason)
      }

      let editingProtection
      try {
        editingProtection = await detectPdfEditingProtectionSafely(pdfDoc)
      } catch (error) {
        const reason: OpenFailureReason = 'broken'
        const source = options?.failureSource ?? { bytes, name }
        setOpenFailure({ reason, bytes: source.bytes, name: source.name })
        console.error('PDFの編集制限を確認できませんでした:', error)
        throw new OpenDocumentError(reason)
      }
      if (editingProtection !== 'none') {
        const reason: OpenFailureReason = editingProtection === 'restricted'
          ? 'editing-restricted'
          : 'editing-protected'
        const source = options?.failureSource ?? { bytes, name }
        releasePdf(pdfDoc)
        setOpenFailure({ reason, bytes: source.bytes, name: source.name })
        throw new OpenDocumentError(reason)
      }

      const digitalSignatureStatus = await detectDigitalSignature(bytes)

      releasePdf(docRef.current?.pdfDoc)
      setHistory(createHistory())
      historyWarnedRef.current = false
      signatureGuardRef.current = new FirstEditSignatureGuard()
      setThumbnails(new Map())
      setOpenFailure(null)
      setDocumentKey((key) => key + 1)
      setDocument({
        bytes,
        pageIds: Array.from({ length: pdfDoc.numPages }, () => newPageId()),
        name,
        pdfDoc,
        isDirty: options?.isDirty ?? false,
        digitalSignatureStatus,
      })
    } finally {
      setBusy(false)
    }
  }, [setBusy, setDocument, setHistory])

  const closeDocument = useCallback(() => {
    answerSignatureWarning(false)
    answerHistoryWarning(false)
    releasePdf(docRef.current?.pdfDoc)
    setHistory(createHistory())
    historyWarnedRef.current = false
    signatureGuardRef.current = new FirstEditSignatureGuard()
    setThumbnails(new Map())
    setOpenFailure(null)
    setDocumentKey((key) => key + 1)
    setDocument(null)
  }, [answerSignatureWarning, answerHistoryWarning, setDocument, setHistory])

  const applyOperation = useCallback(async (
    run: (input: OperationInput) => Promise<OperationResult>
  ) => {
    const current = docRef.current
    // 二重実行はここで弾く。画面側のボタン無効化だけでは、
    // ドラッグ操作のように「離した瞬間に呼ぶ」経路をすり抜ける。
    if (!current || busyRef.current) return false
    setBusy(true)
    try {
      return await signatureGuardRef.current.run(
        current.digitalSignatureStatus,
        requestSignatureWarning,
        async () => {
          if (docRef.current !== current) return false

          // 大きなPDFで古い段階が捨てられる場合は、操作の前に1回だけ確かめる
          const drops = wouldDropHistory(historyRef.current, current.bytes.byteLength)
          if (drops > 0 && !historyWarnedRef.current) {
            if (!await requestHistoryWarning(drops)) return false
            historyWarnedRef.current = true
            if (docRef.current !== current) return false
          }

          const { result, pdfDoc } = await prepareOperationResult(current, run)

          // 処理中に文書が閉じられた場合、古い処理結果で画面を復活させない。
          if (docRef.current !== current) {
            releasePdf(pdfDoc)
            return false
          }

          // 操作の「前」を履歴に積む
          setHistory(pushHistory(historyRef.current, {
            bytes: current.bytes,
            pageIds: current.pageIds,
          }))

          // 絵を描き直す必要があるページだけ、覚えていた絵を捨てる。
          // これは新しい読み込み結果ができてから行うこと。先に捨てると、画面はまだ
          // 古い読み込み結果を指したまま描き直しを始め、その直後に下の releasePdf で
          // 古い方が破棄されるため、描いている途中で失敗して「表示できません」になる。
          setThumbnails((prev) => {
            const next = new Map(prev)
            for (const id of result.invalidated) next.delete(id)
            // 無くなったページの絵も捨てる（メモリのため）
            const alive = new Set(result.pageIds)
            for (const id of [...next.keys()]) if (!alive.has(id)) next.delete(id)
            return next
          })
          releasePdf(current.pdfDoc)
          setDocument({
            ...current,
            bytes: result.bytes,
            pageIds: result.pageIds,
            pdfDoc,
            isDirty: true,
          })
          return true
        },
      )
    } finally {
      setBusy(false)
    }
  }, [requestSignatureWarning, requestHistoryWarning, setBusy, setDocument, setHistory])

  /** 元に戻す・やり直しの共通部分。step が次の状態と、更新後の履歴を返す */
  const stepHistory = useCallback(async (
    step: (history: History, now: HistoryEntry) => ReturnType<typeof redoHistory>,
  ) => {
    const current = docRef.current
    if (!current || busyRef.current) return
    const popped = step(historyRef.current, { bytes: current.bytes, pageIds: current.pageIds })
    if (!popped) return

    setBusy(true)
    try {
      setHistory(popped.history)
      const pdfDoc = await loadPdfFromBytes(popped.entry.bytes)
      // どのページの絵が変わるか分からないので、全部捨てて描き直す。
      // 「元に戻す」は連打される操作ではないので、ここは正確さを優先する。
      // 捨てるのは applyOperation と同じ理由で、新しい読み込み結果ができてから。
      setThumbnails(new Map())
      releasePdf(current.pdfDoc)
      setDocument({
        ...current,
        bytes: popped.entry.bytes,
        pageIds: popped.entry.pageIds,
        pdfDoc,
        isDirty: true,
      })
    } finally {
      setBusy(false)
    }
  }, [setBusy, setDocument, setHistory])

  const undo = useCallback(() => stepHistory(undoHistory), [stepHistory])
  const redo = useCallback(() => stepHistory(redoHistory), [stepHistory])

  const markSaved = useCallback(() => {
    const current = docRef.current
    if (!current) return
    setDocument({ ...current, isDirty: false })
  }, [setDocument])

  // 引数を変えない（＝毎回同じ関数のままにする）ことが、
  // PageThumbnail の無駄な描き直しを防ぐ条件になる
  const setThumbnail = useCallback((pageId: string, dataUrl: string) => {
    setThumbnails((prev) => new Map(prev).set(pageId, dataUrl))
  }, [])

  const documentValue = useMemo(
    () => ({
      doc, documentKey, isBusy, canUndo: undoAvailable, canRedo: redoAvailable, undoLimit,
      openDocument, openFailure, dismissOpenFailure: () => setOpenFailure(null),
      closeDocument, applyOperation, undo, redo, markSaved,
      signatureWarningStatus, answerSignatureWarning,
      historyWarningDrops, answerHistoryWarning,
    }),
    [
      doc, documentKey, isBusy, undoAvailable, redoAvailable, undoLimit, openFailure,
      openDocument, closeDocument, applyOperation, undo, redo, markSaved,
      signatureWarningStatus, answerSignatureWarning,
      historyWarningDrops, answerHistoryWarning,
    ]
  )

  const thumbnailValue = useMemo(
    () => ({ thumbnails, setThumbnail }),
    [thumbnails, setThumbnail]
  )

  return (
    <DocumentContext.Provider value={documentValue}>
      <ThumbnailContext.Provider value={thumbnailValue}>
        {children}
      </ThumbnailContext.Provider>
    </DocumentContext.Provider>
  )
}

export function useDocument() {
  const context = useContext(DocumentContext)
  if (context === undefined) {
    throw new Error('useDocument は DocumentProvider の中でしか使えません')
  }
  return context
}

export function useThumbnails() {
  const context = useContext(ThumbnailContext)
  if (context === undefined) {
    throw new Error('useThumbnails は DocumentProvider の中でしか使えません')
  }
  return context
}
