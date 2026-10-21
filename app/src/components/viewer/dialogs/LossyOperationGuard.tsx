import { useEffect, useId, useRef } from 'react'
import { TriangleAlert } from 'lucide-react'

import { t } from '../../../i18n/ja'

interface LossyOperationGuardProps {
  operationName: string
  losses: readonly string[]
  onProceed: () => void
  onCancel: () => void
}

/** ページを画像へ焼き直す前に、失う情報を省略せず示す確認画面。 */
export default function LossyOperationGuard({
  operationName, losses, onProceed, onCancel,
}: LossyOperationGuardProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useRef(onCancel)
  const titleId = useId()
  const bodyId = useId()
  onCancelRef.current = onCancel

  useEffect(() => {
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Delete'
        || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')
      ) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCancelRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const buttons = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>(
        'button:not([disabled])',
      ))
      if (buttons.length === 0) {
        event.preventDefault()
        return
      }
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
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
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 p-6 backdrop-blur-md">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-[2rem] border border-gray-100 bg-white p-8 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
      >
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-900/20">
          <TriangleAlert size={24} />
        </div>
        <h2 id={titleId} className="text-lg font-black dark:text-white">
          {t.viewer.lossyGuardTitle(operationName)}
        </h2>
        <p id={bodyId} className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-zinc-400">
          {t.viewer.lossyGuardBody}
        </p>
        <p className="mt-5 text-xs font-black text-gray-700 dark:text-zinc-200">
          {t.viewer.lossyGuardLossHeading}
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-amber-50 p-4 text-xs font-bold text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
          {losses.map((loss) => <li key={loss}>・{loss}</li>)}
        </ul>
        <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onProceed}
            className="rounded-2xl bg-gray-50 px-5 py-3 text-xs font-bold text-gray-600 hover:bg-gray-100 dark:bg-black dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {t.viewer.lossyGuardProceed}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            autoFocus
            className="rounded-2xl bg-rose-500 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-rose-500/20 hover:bg-rose-600"
          >
            {t.viewer.lossyGuardCancel}
          </button>
        </div>
      </div>
    </div>
  )
}
