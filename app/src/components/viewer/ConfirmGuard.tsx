import { useEffect, useId, useRef } from 'react'
import { ShieldAlert } from 'lucide-react'

interface ConfirmGuardProps {
  title: string
  body: string
  proceedLabel: string
  cancelLabel: string
  onProceed: () => void
  onCancel: () => void
}

/**
 * 取り返しのつかない操作の前に止め、利用者の判断を待つ小窓。
 * 最初は安全側（やめる）のボタンに移動し、Tab は小窓の中に留め、Escape でやめる。
 */
export default function ConfirmGuard({
  title, body, proceedLabel, cancelLabel, onProceed, onCancel,
}: ConfirmGuardProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useRef(onCancel)
  const titleId = useId()
  const bodyId = useId()

  onCancelRef.current = onCancel

  useEffect(() => {
    cancelButtonRef.current?.focus()

    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCancelRef.current()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return

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

    document.addEventListener('keydown', keepFocusInDialog, true)
    return () => {
      document.removeEventListener('keydown', keepFocusInDialog, true)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] shadow-2xl border border-gray-100 dark:border-white/10 p-8 animate-in zoom-in-95 duration-200"
      >
        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 flex items-center justify-center mb-5">
          <ShieldAlert size={24} />
        </div>

        <h2 id={titleId} className="text-lg font-black dark:text-white mb-2">{title}</h2>
        <p id={bodyId} className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed mb-8">{body}</p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            onClick={onProceed}
            className="px-5 py-3 rounded-2xl text-xs font-bold text-gray-600 dark:text-zinc-300 bg-gray-50 dark:bg-black hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all"
          >
            {proceedLabel}
          </button>
          <button
            ref={cancelButtonRef}
            onClick={onCancel}
            autoFocus
            className="px-5 py-3 rounded-2xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-all"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
