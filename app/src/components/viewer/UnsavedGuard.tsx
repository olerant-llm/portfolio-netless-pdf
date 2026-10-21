/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { AlertTriangle } from 'lucide-react'
import { t } from '../../i18n/ja'

interface UnsavedGuardProps {
  /** 「保存せずに閉じる」を押したとき */
  onDiscard: () => void
  /** 「編集に戻る」を押したとき */
  onCancel: () => void
  /** 何が失われるかの説明。省くと「閉じる」の文面になる */
  body?: string
  /** 押すと変更を捨てるほうのボタンの名前。省くと「保存せずに閉じる」 */
  discardLabel?: string
}

/**
 * 保存していない変更があるまま閉じようとしたときに出す確認の小窓。
 *
 * **Windows の確認ダイアログは使わない。** アプリ内の小窓にすれば
 * 新しい許可が要らず、日本語の文面も自由に書けるため。
 *
 * 出す場面は3つあり、それぞれ別の場所が出し入れを持つ:
 *   - ビューアーの「閉じる」を押したとき   … DocumentViewer
 *   - アプリの窓を閉じようとしたとき       … AppShell（旧画面にいる間も見張るため）
 *   - 別のPDFを開こうとしたとき            … AppShell（文書が差し替わるため）
 * この部品自身は状態を持たず、押されたことを伝えるだけにしてある。
 */
export default function UnsavedGuard({
  onDiscard, onCancel, body, discardLabel,
}: UnsavedGuardProps) {
  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.viewer.unsavedTitle}
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] shadow-2xl border border-gray-100 dark:border-white/10 p-8 animate-in zoom-in-95 duration-200"
      >
        <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-900/20 text-rose-500 flex items-center justify-center mb-5">
          <AlertTriangle size={24} />
        </div>

        <h2 className="text-lg font-black dark:text-white mb-2">{t.viewer.unsavedTitle}</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed mb-8">
          {body ?? t.viewer.unsavedBody}
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            onClick={onDiscard}
            className="px-5 py-3 rounded-2xl text-xs font-bold text-gray-600 dark:text-zinc-300 bg-gray-50 dark:bg-black hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all"
          >
            {discardLabel ?? t.viewer.unsavedDiscard}
          </button>

          {/* 既定は「編集に戻る」側。押し間違いで変更が消えないよう、こちらを目立たせる */}
          <button
            onClick={onCancel}
            autoFocus
            className="px-5 py-3 rounded-2xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-all"
          >
            {t.viewer.unsavedCancel}
          </button>
        </div>
      </div>
    </div>
  )
}
