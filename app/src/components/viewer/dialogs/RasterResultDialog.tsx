import { useEffect, useId, useRef } from 'react'
import { Check, Loader2 } from 'lucide-react'

import { t } from '../../../i18n/ja'

interface RasterResultDialogProps {
  operationName: string
  originalPreview: string
  resultPreview: string
  originalSize: number
  resultSize: number
  canApply: boolean
  isApplying: boolean
  onApply: () => void
  onCancel: () => void
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`
  return `${Math.max(0, Math.round(bytes))} B`
}

/** ページ画像を作った後、元PDFへ反映する前に見た目と容量を比べる画面。 */
export default function RasterResultDialog({
  operationName,
  originalPreview,
  resultPreview,
  originalSize,
  resultSize,
  canApply,
  isApplying,
  onApply,
  onCancel,
}: RasterResultDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useRef(onCancel)
  const titleId = useId()
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
      if (event.key === 'Escape' && !isApplying) {
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
  }, [isApplying])

  const saved = originalSize - resultSize
  const percent = originalSize > 0 ? Math.round((Math.abs(saved) / originalSize) * 100) : 0

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div
        ref={dialogRef}
        data-testid="raster-result"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[95vh] w-full max-w-4xl overflow-auto rounded-[2rem] border border-gray-100 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
      >
        <h2 id={titleId} className="text-lg font-black dark:text-white">
          {t.viewer.rasterResultTitle(operationName)}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-zinc-400">
          {t.viewer.rasterResultBody}
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <figure className="rounded-2xl bg-gray-50 p-3 dark:bg-black">
            <figcaption className="mb-2 flex items-center justify-between text-xs font-bold text-gray-500 dark:text-zinc-300">
              <span>{t.viewer.rasterBefore}</span>
              <span>{formatFileSize(originalSize)}</span>
            </figcaption>
            <img src={originalPreview} alt={t.viewer.rasterBefore} className="mx-auto max-h-[48vh] w-auto max-w-full bg-white object-contain" />
          </figure>
          <figure className="rounded-2xl bg-gray-50 p-3 dark:bg-black">
            <figcaption className="mb-2 flex items-center justify-between text-xs font-bold text-gray-500 dark:text-zinc-300">
              <span>{t.viewer.rasterAfter}</span>
              <span>{formatFileSize(resultSize)}</span>
            </figcaption>
            <img src={resultPreview} alt={t.viewer.rasterAfter} className="mx-auto max-h-[48vh] w-auto max-w-full bg-white object-contain" />
          </figure>
        </div>

        <p className={`mt-4 rounded-2xl p-3 text-sm font-bold ${
          canApply
            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
            : 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100'
        }`}>
          {canApply
            ? (saved >= 0
              ? t.viewer.rasterSizeReduced(percent)
              : t.viewer.rasterSizeIncreased(percent))
            : t.viewer.rasterNotSmaller}
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={isApplying}
            autoFocus
            className="rounded-2xl bg-gray-100 px-5 py-3 text-xs font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-30 dark:bg-black dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {t.viewer.lossyGuardCancel}
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!canApply || isApplying}
            className="flex items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 py-3 text-xs font-black text-white shadow-lg shadow-rose-500/20 hover:bg-rose-600 disabled:opacity-30"
          >
            {isApplying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {t.viewer.rasterApplyResult}
          </button>
        </div>
      </div>
    </div>
  )
}
