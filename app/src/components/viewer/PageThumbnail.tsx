/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { memo, useEffect, useRef, useState } from 'react'
import { renderGridThumbnail } from '../../utils/pdfHelpers'
import { t } from '../../i18n/ja'

/**
 * 同時に描く枚数の上限。
 * 「元に戻す」や全ページに効く操作の後、画面にある全ページが一斉に描画へ走るのを防ぐ。
 * canvas での描画はメインスレッドを使うため、走らせすぎると画面が固まる。
 */
const MAX_CONCURRENT = 2
let running = 0
const waiting: Array<{ priority: number, resolve: () => void }> = []

async function withRenderSlot<T>(job: () => Promise<T>, priority: number): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => {
      waiting.push({ priority, resolve })
      waiting.sort((left, right) => left.priority - right.priority)
    })
  }
  running++
  try {
    return await job()
  } finally {
    running--
    waiting.shift()?.resolve()
  }
}

interface PageThumbnailProps {
  /** 既に描いてある絵。まだなら null */
  src: string | null
  /** 表示用の読み込み結果（doc.pdfDoc） */
  pdfDoc: any
  pageId: string
  /** 今の並びでの位置（1始まり）。pdfDoc から絵を取り出すのに使う */
  pageNumber: number
  /** 描けたら呼ぶ。毎回同じ関数を渡すこと（変わると memo が効かない） */
  onRendered: (pageId: string, dataUrl: string) => void
}

/**
 * ページ1枚の絵。
 *
 * - 画面に入ってから描く（200ページのPDFでも起動が重くならない）
 * - 描いた絵は呼び出し側がページIDに紐づけて覚える（スクロールで戻っても描き直さない）
 * - 操作でそのページが変わったときだけ、覚えた絵が捨てられて描き直される
 *
 * この部品は入れ物（Context）を一切見ない。見ると、他のページの絵が1枚描けるたびに
 * 全ページが動き直してしまう。
 */
function PageThumbnailInner({
  src, pdfDoc, pageId, pageNumber, onRendered,
}: PageThumbnailProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState(false)

  // 描き直しが必要になったら（絵が捨てられたら）、失敗の印も消す。
  // 読み込み結果が新しくなったときも消す。そうしないと一度失敗した絵が
  // 「表示できません」のまま二度と描き直されない
  useEffect(() => {
    setFailed(false)
  }, [src, pdfDoc])

  useEffect(() => {
    if (src || visible) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' }
    )
    if (boxRef.current) observer.observe(boxRef.current)
    return () => observer.disconnect()
  }, [src, visible])

  useEffect(() => {
    if (src || failed || !visible || !pdfDoc) return
    let alive = true
    const rect = boxRef.current?.getBoundingClientRect()
    const priority = rect
      ? Math.abs((rect.top + rect.bottom) / 2 - window.innerHeight / 2)
      : Number.MAX_SAFE_INTEGER
    withRenderSlot(() => renderGridThumbnail(pdfDoc, pageNumber), priority).then((url) => {
      if (!alive) return
      if (url) onRendered(pageId, url)
      else setFailed(true) // 空文字 = 失敗。ぐるぐるを回し続けない
    })
    return () => {
      alive = false
    }
  }, [src, failed, visible, pdfDoc, pageNumber, pageId, onRendered])

  if (src) {
    return (
      <img
        src={src}
        alt={`${pageNumber}${t.common.pages}`}
        // draggable={false} を外すと、絵をつまんだ瞬間にブラウザ標準の
        // 「画像を持ち出すドラッグ」が始まり、並べ替えの操作と喧嘩する
        draggable={false}
        className="w-full h-full object-contain bg-white pointer-events-none select-none"
      />
    )
  }

  if (failed) {
    return (
      <div className="w-full h-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-gray-400 text-center px-2">
        {t.viewer.thumbnailFailed}
      </div>
    )
  }

  return (
    <div
      ref={boxRef}
      className="w-full h-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center"
    >
      <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/**
 * memo で包むのが要点。
 * 呼び出し側（PageGrid）は絵が1枚描けるたびに動き直すが、
 * ここは自分の src が変わったページだけが実際に描き直される。
 */
export const PageThumbnail = memo(PageThumbnailInner)
