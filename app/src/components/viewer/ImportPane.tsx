/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { MutableRefObject, useCallback, useEffect, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { X, Check, Loader2, FileInput, GripVertical, ArrowLeft, MousePointerClick } from 'lucide-react'

import { useDocument, releasePdf } from '../../document/documentSession'
import { loadPdfFromBytes } from '../../utils/pdfHelpers'
import { PageThumbnail } from './PageThumbnail'
import { ImportSource } from './ImportSourcePicker'
import { t } from '../../i18n/ja'

/** ドラッグしているものが取り込み元のページかどうかの目印 */
export const IMPORT_DRAG_TYPE = 'import'

interface ImportPageProps {
  index: number
  picked: boolean
  disabled: boolean
  src: string | null
  pdfDoc: any
  onRendered: (pageId: string, dataUrl: string) => void
  onToggle: (index: number) => void
}

/**
 * 取り込み元のページ1枚。クリックで選べて、左の一覧へドラッグもできる。
 *
 * ドラッグの土台（DndContext）は DocumentViewer にあり、
 * 落とされたときの処理もそちらが持っている。ここは「掴めるようにする」だけ。
 */
function ImportPage({
  index, picked, disabled, src, pdfDoc, onRendered, onToggle,
}: ImportPageProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `import:${index}`,
    data: { type: IMPORT_DRAG_TYPE, index },
    disabled,
  })

  return (
    <div
      ref={setNodeRef}
      data-testid="import-page"
      {...attributes}
      {...listeners}
      onClick={() => onToggle(index)}
      title={t.viewer.importDragBadge}
      className={`group relative aspect-[3/4] rounded-xl overflow-hidden border-2 shadow-sm transition-all touch-none ${
        disabled ? 'cursor-wait' : 'cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-30' : ''} ${
        picked
          ? 'border-rose-500 ring-2 ring-rose-500/30 bg-rose-50 dark:bg-rose-900/20'
          : 'border-transparent hover:border-rose-300 bg-gray-50 dark:bg-black'
      }`}
    >
      <div className="w-full h-full p-1.5 pointer-events-none">
        <PageThumbnail
          pageId={String(index + 1)}
          pageNumber={index + 1}
          src={src}
          pdfDoc={pdfDoc}
          onRendered={onRendered}
        />
      </div>

      {picked && (
        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg">
          <Check size={12} strokeWidth={3} />
        </div>
      )}
      {/* つかめることを示す印。選んだページは常に、それ以外はマウスを乗せたときだけ出す */}
      <div
        className={`absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-rose-500 text-white text-[9px] font-black shadow-lg transition-opacity ${
          picked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <GripVertical size={11} />
        {t.viewer.importDragBadge}
      </div>
      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/50 backdrop-blur-md rounded text-[9px] font-black text-white">
        {index + 1}
      </div>
    </div>
  )
}

interface ImportPaneProps {
  source: ImportSource
  onClose: () => void
  /** 取り込み元で選ばれているページ（0始まりの番号）。持ち主は DocumentViewer */
  picked: Set<number>
  onPickedChange: (next: Set<number>) => void
  /** 選んだページを入れる。ボタンからもドラッグからも、これ1本を通る */
  onInsert: (indices: number[], insertAtPageId: string | null) => Promise<void>
  /** 直前にドラッグが終わった時刻。離した直後のクリックを無視するのに使う */
  dragEndedAtRef: MutableRefObject<number>
}

/**
 * 取り込み元のパネル。編集中の一覧と左右に並べて出す。
 *
 * ここで開いたPDFは**表示するだけ**で、開いている文書とは別物。
 * 「入れる」を押すか、左の一覧へドラッグしたときだけページが足される。
 */
export default function ImportPane({
  source, onClose, picked, onPickedChange, onInsert, dragEndedAtRef,
}: ImportPaneProps) {
  const { isBusy } = useDocument()

  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [pageCount, setPageCount] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** 描いた絵。ページ番号（1始まり）ごとに覚える */
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map())
  /** 取り込み元を開き直すたびに増やす。ページの絵の部品を作り直させるため */
  const [sourceKey, setSourceKey] = useState(0)

  // 取り込み元が変わったら読み直す。
  // **古い読み込み結果は、新しいものを画面へ渡した後で捨てる**（先に捨てると描画が失敗する）
  useEffect(() => {
    let alive = true
    let loaded: any = null

    setThumbnails(new Map())
    onPickedChange(new Set())
    setLoadError(null)
    setPdfDoc(null)
    setPageCount(0)
    setSourceKey((n) => n + 1)

    loadPdfFromBytes(source.bytes)
      .then((next) => {
        loaded = next
        if (!alive) {
          releasePdf(next)
          return
        }
        setPdfDoc(next)
        setPageCount(next.numPages)
      })
      .catch((err: any) => {
        if (!alive) return
        console.error('取り込み元を開けませんでした:', err)
        setLoadError(
          err?.name === 'PasswordException' ? t.viewer.lockedNotSupported : t.errors.broken
        )
      })

    return () => {
      alive = false
      releasePdf(loaded)
    }
    // 取り込み元が差し替わったときだけ読み直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  // 引数を変えないことが、PageThumbnail の無駄な描き直しを防ぐ条件になる
  const handleRendered = useCallback((pageId: string, dataUrl: string) => {
    setThumbnails((prev) => new Map(prev).set(pageId, dataUrl))
  }, [])

  const togglePage = (index: number) => {
    if (isBusy) return
    // ドラッグを離すと、その直後にクリックとしても拾われる。
    // 対策なしだと、左へ運んだ直後にそのページの選択が外れる
    if (Date.now() - dragEndedAtRef.current < 300) return

    const next = new Set(picked)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    onPickedChange(next)
  }

  const handleInsert = async () => {
    if (picked.size === 0) return
    await onInsert([...picked].sort((a, b) => a - b), null)
  }

  const smallButtonClass =
    'px-3 py-1.5 rounded-xl text-[11px] font-bold text-gray-500 dark:text-zinc-400 '
    + 'bg-gray-50 dark:bg-black hover:text-rose-500 transition-all '
    + 'disabled:opacity-30 disabled:cursor-not-allowed'

  return (
    <div data-testid="import-pane" className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-gray-100 dark:border-white/5 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 flex items-center justify-center shrink-0">
          <FileInput size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black tracking-widest text-gray-400">
            {t.viewer.importTitle}
          </p>
          <p className="font-bold text-sm truncate dark:text-white">{source.name}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-rose-500 transition-colors"
          aria-label={t.viewer.importClose}
          title={t.viewer.importClose}
        >
          <X size={18} />
        </button>
      </div>

      {loadError ? (
        <p className="text-xs text-rose-500 leading-relaxed py-4">{loadError}</p>
      ) : !pdfDoc ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-10 justify-center">
          <Loader2 size={16} className="animate-spin" />
          {t.viewer.importLoading}
        </div>
      ) : (
        <>
          {/*
            使い方の本命は「選んで、左の好きな位置へドラッグ」。
            小さな注意書きでは読まれないので、手順として一番目立つ場所に置く
          */}
          <div data-testid="import-steps" className="rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/40 p-4 space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-black flex items-center justify-center shrink-0">1</span>
              <MousePointerClick size={18} className="text-rose-500 shrink-0" />
              <p className="text-sm font-bold text-gray-700 dark:text-zinc-200">{t.viewer.importStepPick}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-black flex items-center justify-center shrink-0">2</span>
              <ArrowLeft size={18} className="text-rose-500 shrink-0 animate-pulse" />
              <p className="text-sm font-bold text-gray-700 dark:text-zinc-200">{t.viewer.importStepDrag}</p>
            </div>
            <p data-testid="import-next" className="pt-2 border-t border-rose-100 dark:border-rose-900/40 text-[13px] font-black text-rose-600 dark:text-rose-400">
              {picked.size === 0 ? t.viewer.importNextPick : t.viewer.importNextDrag(picked.size)}
            </p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-gray-400">
              {picked.size > 0
                ? t.viewer.importSelectedCount(picked.size)
                : t.viewer.pageCount(pageCount)}
            </p>
            <div className="flex gap-1">
              <button
                data-testid="import-select-all"
                onClick={() =>
                  onPickedChange(new Set(Array.from({ length: pageCount }, (_, i) => i)))
                }
                disabled={isBusy}
                className={smallButtonClass}
              >
                {t.viewer.importSelectAll}
              </button>
              <button
                data-testid="import-clear-selection"
                onClick={() => onPickedChange(new Set())}
                disabled={isBusy || picked.size === 0}
                className={smallButtonClass}
              >
                {t.viewer.importClearSelection}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 xl:grid-cols-4 gap-3 max-h-[46vh] overflow-y-auto pr-1">
            {Array.from({ length: pageCount }, (_, i) => (
              <ImportPage
                key={`${sourceKey}-${i}`}
                index={i}
                picked={picked.has(i)}
                disabled={isBusy}
                src={thumbnails.get(String(i + 1)) ?? null}
                pdfDoc={pdfDoc}
                onRendered={handleRendered}
                onToggle={togglePage}
              />
            ))}
          </div>

          {/* 末尾へまとめて入れるのは補助の手段。ドラッグの案内より目立たせない */}
          <button
            data-testid="import-insert-end"
            onClick={handleInsert}
            disabled={isBusy || picked.size === 0}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-gray-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 hover:border-rose-300 hover:text-rose-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isBusy ? <Loader2 size={14} className="animate-spin" /> : <FileInput size={14} />}
            {picked.size === 0 ? t.viewer.importInsertNone : t.viewer.importInsert(picked.size)}
          </button>
        </>
      )}
    </div>
  )
}
