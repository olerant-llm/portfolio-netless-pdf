import { useEffect, useId } from 'react'
import { Loader2 } from 'lucide-react'

import { t } from '../../../i18n/ja'

interface RasterProgressDialogProps {
  operationName: string
  completedPages: number
  totalPages: number
  percent: number
}

/** 長い画像化の途中で、操作を重ねずに進み具合を確認する画面。 */
export default function RasterProgressDialog({
  operationName, completedPages, totalPages, percent,
}: RasterProgressDialogProps) {
  const titleId = useId()

  useEffect(() => {
    const blockBackgroundShortcut = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('keydown', blockBackgroundShortcut, true)
    return () => document.removeEventListener('keydown', blockBackgroundShortcut, true)
  }, [])

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 p-6 backdrop-blur-md">
      <div
        data-testid="raster-progress"
        data-completed-pages={completedPages}
        role="dialog"
        aria-modal="true"
        aria-busy="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-[2rem] border border-gray-100 bg-white p-8 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
      >
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-rose-500" />
        <h2 id={titleId} className="mt-5 text-center text-lg font-black dark:text-white">
          {t.viewer.rasterProgressTitle(operationName)}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500 dark:text-zinc-400">
          {t.viewer.rasterProgressPages(completedPages, totalPages)}
        </p>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-black">
          <div
            className="h-full rounded-full bg-rose-500 transition-[width]"
            style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
          />
        </div>
        <p className="mt-2 text-right text-xs font-black text-rose-500">{percent}%</p>
      </div>
    </div>
  )
}
