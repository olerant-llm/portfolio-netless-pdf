import { t } from '../../../i18n/ja'

interface StatusStripProps {
  selectedCount: number
  undoLimit: number | null
  onClear: () => void
}

/** ページ一覧の上の細い帯。選択数か、使い方のヒントを出す */
export default function StatusStrip({ selectedCount, undoLimit, onClear }: StatusStripProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 mb-3 px-1 min-h-7 text-xs text-gray-500 dark:text-zinc-400"
    >
      {selectedCount > 0 ? (
        <>
          <span className="font-black text-rose-500">{t.viewer.statusSelected(selectedCount)}</span>
          <button
            type="button"
            onClick={onClear}
            className="px-2.5 py-1 rounded-lg font-bold bg-gray-100 dark:bg-zinc-800 hover:text-rose-500 transition-colors"
          >
            {t.viewer.clearSelection}
          </button>
        </>
      ) : (
        <span>{t.viewer.statusHint}</span>
      )}
      {undoLimit !== null && (
        <span className="ml-auto font-bold">{t.viewer.undoLimited(undoLimit)}</span>
      )}
    </div>
  )
}
