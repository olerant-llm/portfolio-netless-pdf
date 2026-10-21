import { useEffect, useState } from 'react'
import { useReportBusy } from '../toolbar/useReportBusy'
import { Check, Copy, FileText, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

import { DocumentState, useDocument } from '../../../document/documentSession'
import { ExportProgress } from '../../../exports/exportProgress'
import { safeExportBaseName } from '../../../exports/fileNames'
import { extractPdfText, TextExportResult } from '../../../exports/textExport'
import { t } from '../../../i18n/ja'
import { downloadFile } from '../../../utils/pdfHelpers'
import { toUserMessage } from '../../../utils/userMessage'

interface TextExportSectionProps {
  /** 処理中かどうかを外側の小窓へ知らせる */
  onBusyChange?: (busy: boolean) => void
  doc: DocumentState
  selected: Set<string>
}

export default function TextExportSection({ doc, selected, onBusyChange }: TextExportSectionProps) {
  const { isBusy } = useDocument()
  const [scope, setScope] = useState<'selected' | 'all'>('all')
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  useReportBusy(progress !== null, onBusyChange)
  const [result, setResult] = useState<TextExportResult | null>(null)
  const [copied, setCopied] = useState(false)
  const targets = scope === 'all' ? doc.pageIds : doc.pageIds.filter((id) => selected.has(id))

  useEffect(() => {
    setResult(null)
    setCopied(false)
  }, [doc.bytes, scope, selected])

  const readText = async () => {
    if (isBusy || progress || targets.length === 0) return
    setProgress({ completedPages: 0, totalPages: targets.length, percent: 0 })
    try {
      setResult(await extractPdfText(doc.pdfDoc, doc.pageIds, targets, setProgress))
    } catch (error) {
      console.error(error)
      toast.error(toUserMessage(error))
    } finally {
      setProgress(null)
    }
  }

  const copyText = async () => {
    if (!result) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(result.text)
      setCopied(true)
      toast.success(t.viewer.exportTextCopied)
    } catch {
      toast.error(t.viewer.exportTextCopyFailed)
    }
  }

  const saveText = async () => {
    if (!result) return
    try {
      const saved = await downloadFile(
        result.text,
        `${safeExportBaseName(doc.name)}-文字.txt`,
        'text/plain',
      )
      toast[saved ? 'success' : 'info'](saved ? t.viewer.exportTextSaved : t.viewer.saveCanceled)
    } catch {
      toast.error(t.errors.saveFailed)
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
          <FileText size={16} className="text-rose-500" />
          {t.viewer.exportTextHeading}
        </h3>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400">{t.viewer.exportTextHint}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={scope === 'all'} disabled={isBusy || progress !== null} onClick={() => { setScope('all'); setResult(null) }} className={choiceClass(scope === 'all')}>{t.viewer.allPages}</button>
        <button type="button" aria-pressed={scope === 'selected'} disabled={isBusy || progress !== null || selected.size === 0} onClick={() => { setScope('selected'); setResult(null) }} className={choiceClass(scope === 'selected')}>{t.viewer.selectedPages}</button>
      </div>
      {!result && (
        <button type="button" onClick={readText} disabled={isBusy || progress !== null || targets.length === 0} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 py-3.5 text-sm font-black text-white shadow-lg shadow-rose-500/20 hover:bg-rose-600 disabled:opacity-30">
          {progress ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          {progress ? `${progress.percent}%` : t.viewer.exportTextAction}
        </button>
      )}
      {result && (
        <div className="space-y-3">
          {!result.hasText && <p className="rounded-xl bg-amber-50 p-3 text-[11px] font-bold text-amber-800 dark:bg-amber-900/20 dark:text-amber-100">{t.viewer.exportTextEmpty}</p>}
          <textarea readOnly value={result.text} aria-label={t.viewer.exportTextPreview} className="h-48 w-full resize-none rounded-xl bg-gray-50 p-3 font-mono text-xs outline-none dark:bg-black dark:text-zinc-300" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={copyText} className="flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-2 py-3 text-[11px] font-bold text-gray-600 dark:bg-zinc-800 dark:text-zinc-300">
              {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
              {t.viewer.copy}
            </button>
            <button type="button" onClick={saveText} className="flex items-center justify-center gap-2 rounded-xl bg-rose-500 px-2 py-3 text-[11px] font-bold text-white">
              <Save size={15} />
              {t.viewer.exportTextSave}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
