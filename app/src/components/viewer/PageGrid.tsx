/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { MutableRefObject, useRef } from 'react'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Check } from 'lucide-react'

import { useThumbnails, useDocument } from '../../document/documentSession'
import { PageThumbnail } from './PageThumbnail'
import { t } from '../../i18n/ja'

/** 取り込み元のページを落とすと、このページの前／後ろに入る */
export type InsertSide = 'before' | 'after'

export interface InsertMarker {
  pageId: string
  side: InsertSide
}

interface SortablePageProps {
  id: string
  pageNumber: number
  src: string | null
  pdfDoc: any
  disabled: boolean
  selected: boolean
  /** まとめて動かしている最中のページか */
  moving: boolean
  /** まとめて動かしている枚数。掴んでいるページの上に出す */
  movingCount: number
  /** 取り込み元をこのページの手前／後ろに落とそうとしているとき、縦の棒を出す */
  marker: InsertSide | null
  onRendered: (pageId: string, dataUrl: string) => void
  onZoom: (pageNumber: number) => void
  onClick: (pageId: string, event: React.MouseEvent) => void
  onContextMenu?: (pageId: string, x: number, y: number) => void
}

function SortablePage({
  id, pageNumber, src, pdfDoc, disabled, selected, moving, movingCount,
  marker, onRendered, onZoom, onClick, onContextMenu,
}: SortablePageProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 0,
    position: 'relative' as const,
  }

  // 選択中の枠 → ドラッグ中の枠 の順で上書きする
  const borderClass = isDragging
    ? 'border-rose-500 shadow-2xl scale-105 opacity-90'
    : selected
      ? 'border-rose-500 ring-2 ring-rose-500/30'
      : 'border-transparent hover:border-rose-300'

  return (
    <div
      ref={setNodeRef}
      data-testid="page-card"
      data-page-id={id}
      data-page-number={pageNumber}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => onClick(id, e)}
      onDoubleClick={() => onZoom(pageNumber)}
      onContextMenu={(e) => {
        if (!onContextMenu || disabled) return
        e.preventDefault()
        onContextMenu(id, e.clientX, e.clientY)
      }}
      title={t.viewer.zoomHint}
      className={`relative aspect-[3/4] touch-none transition-opacity ${
        disabled ? 'cursor-wait' : 'cursor-grab active:cursor-grabbing'
      } ${
        // 一緒に動く仲間は薄くする。掴んだ1枚しか動かないように見えるのを防ぐ
        moving && !isDragging ? 'opacity-40' : ''
      }`}
    >
      {/*
        絵のはみ出しを切るのは内側の箱で行う。
        外側で切ると、入る位置を示す縦の棒がページの外に出せなくなる
      */}
      <div
        className={`relative group w-full h-full rounded-xl overflow-hidden border-2 shadow-sm transition-all ${
          selected ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-gray-50 dark:bg-black'
        } ${borderClass}`}
      >
        <div className="w-full h-full p-2">
          <PageThumbnail
            pageId={id}
            pageNumber={pageNumber}
            src={src}
            pdfDoc={pdfDoc}
            onRendered={onRendered}
          />
        </div>

        {selected && (
          <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg">
            <Check size={14} strokeWidth={3} />
          </div>
        )}

        <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-md rounded-lg p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={14} />
        </div>
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-md rounded text-[9px] font-black text-white">
          {pageNumber}
        </div>

        {/* 掴んでいるページの上に「3ページを移動中」と出す */}
        {isDragging && movingCount > 1 && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center px-1">
            <span className="px-2.5 py-1 rounded-full bg-rose-500 text-white text-[10px] font-black shadow-lg whitespace-nowrap">
              {t.viewer.movingPages(movingCount)}
            </span>
          </div>
        )}
      </div>

      {marker && (
        <div
          className={`absolute inset-y-1 w-1.5 rounded-full bg-rose-500 shadow-lg shadow-rose-500/40 pointer-events-none ${
            marker === 'before' ? '-left-2.5' : '-right-2.5'
          }`}
        />
      )}
    </div>
  )
}

interface PageGridProps {
  /** 表示する並び。ドラッグ直後は暫定の並びが渡ってくる */
  order: string[]
  /** 絵を描くのに使う読み込み結果。暫定の並びを表示している間は null が渡る */
  pdfDoc: any
  /** ダブルクリックで拡大表示を開く */
  onZoom: (pageNumber: number) => void
  /** 選択中のページID */
  selected: Set<string>
  onSelectionChange: (next: Set<string>) => void
  /** 1行に並べる枚数。取り込み元を開いている間は場所が半分になるので narrow */
  columns?: 'wide' | 'narrow'
  /** 取り込み元を落とそうとしている位置。null なら棒を出さない */
  insertMarker: InsertMarker | null
  /** 今まとめて動かしているページ。ドラッグ中だけ入る */
  movingPageIds: Set<string> | null
  /** Shift+クリックの起点。ドラッグ開始でも書き換わるので、持ち主は DocumentViewer */
  anchorRef: MutableRefObject<string | null>
  /** 直前にドラッグが終わった時刻。離した直後のクリックを無視するのに使う */
  dragEndedAtRef: MutableRefObject<number>
  /** ページを右クリックしたとき。画面上の位置も渡す */
  onContextMenu?: (pageId: string, x: number, y: number) => void
}

/**
 * ページのサムネイル一覧。ビューアーの主画面。
 *
 * **ドラッグの土台（DndContext）はここには無い。** 取り込み元のページを
 * この一覧へ運べるようにするため、土台は DocumentViewer が持っている。
 * ここは「並べ替えの枠・クリックでの選択・絵の描画」だけを受け持つ。
 *
 * サムネイルの入れ物を見るのはここだけ。絵は引数で各ページへ渡す。
 * PageThumbnail に入れ物を直接見させると、絵が1枚描けるたびに全ページが動き直す。
 */
export default function PageGrid({
  order, pdfDoc, onZoom, selected, onSelectionChange,
  columns = 'wide', insertMarker, movingPageIds, anchorRef, dragEndedAtRef, onContextMenu,
}: PageGridProps) {
  const { thumbnails, setThumbnail } = useThumbnails()
  const { isBusy } = useDocument()

  /**
   * 素のクリックで選択を置き換える直前の選択。
   * ダブルクリック（拡大）は選択を変えない約束なので、続けてダブルクリックが
   * 来たらこれを書き戻す。1回目のクリックのときだけ覚える。
   */
  const beforeClickRef = useRef<Set<string> | null>(null)

  const handleClick = (id: string, event: React.MouseEvent) => {
    if (isBusy) return
    // ドラッグを離すと、その直後にクリックとしても拾われる。そのまま通すと
    // まとめて動かした直後に選択が1枚へ戻ってしまうので、少しの間は無視する
    if (Date.now() - dragEndedAtRef.current < 300) return

    if (event.shiftKey && anchorRef.current) {
      const from = order.indexOf(anchorRef.current)
      const to = order.indexOf(id)
      if (from >= 0 && to >= 0) {
        // 範囲選択は「起点からここまで」に置き換える（Windows と同じ動き）
        const [start, end] = from <= to ? [from, to] : [to, from]
        onSelectionChange(new Set(order.slice(start, end + 1)))
        return
      }
    }

    if (event.ctrlKey || event.metaKey) {
      const next = new Set(selected)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      anchorRef.current = id
      onSelectionChange(next)
      return
    }

    if (event.detail === 1) beforeClickRef.current = selected
    anchorRef.current = id
    onSelectionChange(new Set([id]))
  }

  const handleDoubleClick = (pageNumber: number) => {
    if (beforeClickRef.current) {
      onSelectionChange(beforeClickRef.current)
      beforeClickRef.current = null
    }
    onZoom(pageNumber)
  }

  return (
    <SortableContext items={order} strategy={rectSortingStrategy}>
      {/* 取り込み元が右に入ったぶん、1行あたりの枚数を減らして絵を見やすく保つ */}
      <div
        className={`grid gap-4 ${
          columns === 'narrow'
            ? 'grid-cols-2 md:grid-cols-3'
            : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
        }`}
      >
        {order.map((id, index) => (
          <SortablePage
            key={id}
            id={id}
            pageNumber={index + 1}
            src={thumbnails.get(id) ?? null}
            pdfDoc={pdfDoc}
            disabled={isBusy}
            selected={selected.has(id)}
            moving={movingPageIds?.has(id) ?? false}
            movingCount={movingPageIds?.size ?? 0}
            marker={insertMarker?.pageId === id ? insertMarker.side : null}
            onRendered={setThumbnail}
            onZoom={handleDoubleClick}
            onClick={handleClick}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    </SortableContext>
  )
}
