import { useState } from 'react'
import { useReportBusy } from '../toolbar/useReportBusy'
import { Images, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { DocumentState, useDocument } from '../../../document/documentSession'
import {
  exportPdfPagesAsImages,
  PageImageFormat,
} from '../../../exports/pdfToImages'
import { ExportProgress } from '../../../exports/exportProgress'
import { t } from '../../../i18n/ja'
import { downloadFile } from '../../../utils/pdfHelpers'
import { toUserMessage } from '../../../utils/userMessage'

interface PdfImagesExportSectionProps {
  /** 処理中かどうかを外側の小窓へ知らせる */
  onBusyChange?: (busy: boolean) => void
  doc: DocumentState
  selected: Set<string>
}

export default function PdfImagesExportSection({ doc, selected, onBusyChange }: PdfImagesExportSectionProps) {
  const { isBusy } = useDocument()
  const [format, setFormat] = useState<PageImageFormat>('png')
  const [scope, setScope] = useState<'selected' | 'all'>('all')
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  useReportBusy(progress !== null, onBusyChange)
  const targets = scope === 'all'
    ? doc.pageIds
    : doc.pageIds.filter((id) => selected.has(id))
  const disabled = isBusy || progress !== null || targets.length === 0

  const runExport = async () => {
    if (disabled) return
    setProgress({ completedPages: 0, totalPages: targets.length, percent: 0 })
    try {
      const result = await exportPdfPagesAsImages(
        doc.pdfDoc,
        doc.pageIds,
        targets,
        { format, scale: 2, sourceName: doc.name },
        setProgress,
      )
      const saved = await downloadFile(result.bytes, result.fileName, result.mimeType)
      toast[saved ? 'success' : 'info'](
        saved ? t.viewer.exportImagesSaved(result.pageCount) : t.viewer.saveCanceled,
      )
    } catch (error) {
      console.error(error)
      toast.error(toUserMessage(error))
    } finally {
      setProgress(null)
    }
  }

  const choiceClass = (active: boolean) => `rounded-xl px-2 py-2.5 text-[11px] font-bold transition-all disabled:opacity-30 ${
    active
      ? 'bg-rose-500 text-white shadow-md'
      : 'bg-gray-100 text-gray-500 hover:text-rose-500 dark:bg-zinc-800 dark:text-zinc-400'
  }`

  return (
    <div className="space-y-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-black text-gray-700 dark:text-zinc-200">
          <Images size={16} className="text-rose-500" />
          {t.viewer.exportImagesHeading}
        </h3>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
          {t.viewer.exportImagesHint}
        </p>
      </div>

      <fieldset>
        <legend className="text-[11px] font-bold text-gray-500 dark:text-zinc-300">{t.viewer.exportImageFormat}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(['png', 'jpg'] as const).map((value) => (
            <button key={value} type="button" aria-pressed={format === value} disabled={isBusy || progress !== null} onClick={() => setFormat(value)} className={choiceClass(format === value)}>
              {value === 'png' ? 'PNG' : 'JPEG'}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[11px] font-bold text-gray-500 dark:text-zinc-300">{t.viewer.exportRange}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={scope === 'all'} disabled={isBusy || progress !== null} onClick={() => setScope('all')} className={choiceClass(scope === 'all')}>{t.viewer.allPages}</button>
          <button type="button" aria-pressed={scope === 'selected'} disabled={isBusy || progress !== null || selected.size === 0} onClick={() => setScope('selected')} className={choiceClass(scope === 'selected')}>{t.viewer.selectedPages}</button>
        </div>
      </fieldset>

      {progress && (
        <div role="status" className="space-y-2 rounded-xl bg-gray-50 p-3 text-[11px] font-bold text-gray-500 dark:bg-black dark:text-zinc-300">
          <p>{t.viewer.rasterProgressPages(progress.completedPages, progress.totalPages)}</p>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-800">
            <div className="h-full bg-rose-500" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}

      <button type="button" onClick={runExport} disabled={disabled} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 py-3.5 text-sm font-black text-white shadow-lg shadow-rose-500/20 hover:bg-rose-600 disabled:opacity-30">
        {progress ? <Loader2 size={16} className="animate-spin" /> : <Images size={16} />}
        {progress ? t.viewer.exporting : t.viewer.exportImagesAction}
      </button>
    </div>
  )
}
