import { ReactNode, useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { t } from '../../../i18n/ja'

interface ToolDialogProps {
  title: string
  onClose: () => void
  /** 処理中など、閉じさせたくない間は true */
  locked?: boolean
  /** 白黒化の確認・進行窓を出している間など、小窓自体を一時的に隠すときは true */
  concealed?: boolean
  children: ReactNode
}

/** 設定を行う小窓。中身が長くても小窓の中で上下に動かせる */
export default function ToolDialog({
  title, onClose, locked = false, concealed = false, children,
}: ToolDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const lockedRef = useRef(locked)
  const onCloseRef = useRef(onClose)
  lockedRef.current = locked
  onCloseRef.current = onClose

  useEffect(() => {
    // 開く前にいた場所。閉じたらそこへ戻す
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current
      ?.querySelector<HTMLElement>('input, select, textarea, button:not([aria-label])')
      ?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      // 上に警告窓や白黒化の進行窓などが重なっているときは、その窓に任せる
      if (document.querySelectorAll('[aria-modal="true"]').length > 1) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!lockedRef.current) onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      // Tab は小窓の中だけを巡らせる（奥のツールバーを押せないように）
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ))
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  return (
    <div
      className={`fixed inset-0 z-[400] items-start justify-center p-6 pt-24 bg-black/40 ${concealed ? 'hidden' : 'flex'}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !locked) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg flex flex-col max-h-[80vh] bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-white/10"
      >
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <h2 id={titleId} className="text-base font-black dark:text-white">{title}</h2>
          <button
            type="button"
            aria-label={t.viewer.toolDialogClose}
            disabled={locked}
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-rose-500 disabled:opacity-30"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  )
}
