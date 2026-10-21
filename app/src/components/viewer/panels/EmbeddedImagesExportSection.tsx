import { useState } from 'react'
import { useReportBusy } from '../toolbar/useReportBusy'
import { ImageDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { DocumentState, useDocument } from '../../../document/documentSession'
import { exportEmbeddedImages } from '../../../exports/embeddedImages'
import { ExportProgress } from '../../../exports/exportProgress'
import { t } from '../../../i18n/ja'
import { downloadFile } from '../../../utils/pdfHelpers'
import { toUserMessage } from '../../../utils/userMessage'

export default function EmbeddedImagesExportSection({ doc, onBusyChange }: {
  doc: DocumentState
  /** 処理中かどうかを外側の小窓へ知らせる */
  onBusyChange?: (busy: boolean) => void
}) {
  const { isBusy } = useDocument()
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  useReportBusy(progress !== null, onBusyChange)

  const runExport = async () => {
    if (isBusy || progress) return
    setProgress({ completedPages: 0, totalPages: doc.pageIds.length, percent: 0 })
    try {
      const result = await exportEmbeddedImages(doc.pdfDoc, doc.name, setProgress)
      const saved = await downloadFile(result.bytes, result.fileName, result.mimeType)
      toast[saved ? 'success' : 'info'](
        saved ? t.viewer.exportEmbeddedSaved(result.imageCount) : t.viewer.saveCanceled,
      )
    } catch (error) {
      console.error(error)
      toast.error(toUserMessage(error))
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-black text-gray-700 dark:text-zinc-200">
          <ImageDown size={16} className="text-rose-500" />
          {t.viewer.exportEmbeddedHeading}
        </h3>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400">{t.viewer.exportEmbeddedHint}</p>
      </div>
      {progress && (
        <p role="status" className="rounded-xl bg-gray-50 p-3 text-[11px] font-bold text-gray-500 dark:bg-black dark:text-zinc-300">
          {t.viewer.rasterProgressPages(progress.completedPages, progress.totalPages)}（{progress.percent}%）
        </p>
      )}
      <button type="button" onClick={runExport} disabled={isBusy || progress !== null} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 py-3.5 text-sm font-black text-white shadow-lg shadow-rose-500/20 hover:bg-rose-600 disabled:opacity-30">
        {progress ? <Loader2 size={16} className="animate-spin" /> : <ImageDown size={16} />}
        {progress ? t.viewer.exporting : t.viewer.exportEmbeddedAction}
      </button>
    </div>
  )
}
