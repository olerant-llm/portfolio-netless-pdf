import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Palette, Zap } from 'lucide-react'
import { toast } from 'sonner'

import { DocumentState, releasePdf, useDocument } from '../../../document/documentSession'
import { t } from '../../../i18n/ja'
import {
  compressFromRasterPages,
  CompressionQuality,
  compressionSettings,
  inspectCompressionCandidate,
} from '../../../operations/compressOp'
import {
  grayscaleFromRasterPages,
  GRAYSCALE_RASTER_SETTINGS,
} from '../../../operations/grayscaleOp'
import {
  applyPreparedRasterCandidate,
  RASTERIZATION_INFORMATION_LOSSES,
} from '../../../operations/lossyRasterOp'
import { rasterizeOpenPdfPages, RasterProgress } from '../../../operations/rasterizeOpenPdf'
import { OperationError, OperationResult } from '../../../operations/types'
import { loadPdfFromBytes, renderPageThumbnail } from '../../../utils/pdfHelpers'
import { toUserMessage } from '../../../utils/userMessage'
import LossyOperationGuard from '../dialogs/LossyOperationGuard'
import RasterProgressDialog from '../dialogs/RasterProgressDialog'
import RasterResultDialog from '../dialogs/RasterResultDialog'

export type RasterMode = 'grayscale' | 'compress'
type DialogStage = 'warning' | 'processing' | 'result' | null

interface RasterCandidate extends OperationResult {
  operationName: string
  originalPreview: string
  resultPreview: string
  originalSize: number
  resultSize: number
  canApply: boolean
  sourceBytes: Uint8Array
  sourcePageIds: string[]
}

const EMPTY_PROGRESS: RasterProgress = { completedPages: 0, totalPages: 0, percent: 0 }

const QUALITY_CHOICES: Array<{ id: CompressionQuality, label: string, hint: string }> = [
  { id: 'high', label: t.viewer.compressQualityHigh, hint: t.viewer.compressQualityHighHint },
  { id: 'medium', label: t.viewer.compressQualityMedium, hint: t.viewer.compressQualityMediumHint },
  { id: 'low', label: t.viewer.compressQualityLow, hint: t.viewer.compressQualityLowHint },
]

interface RasterPanelProps {
  /** 渡すと、その方式に決めた状態で開き、方式の切替ボタンを出さない */
  initialMode?: RasterMode
  /** 警告から結果確認までの間 true を知らせる（外側の小窓を閉じさせないため） */
  onBusyChange?: (busy: boolean) => void
  /** 結果を反映できたときだけ呼ぶ */
  onApplied?: () => void
}

/** 白黒化と軽量化の、警告→処理→見本確認→反映を共通化したパネル。 */
export default function RasterPanel({ initialMode, onBusyChange, onApplied }: RasterPanelProps = {}) {
  const { doc, applyOperation, isBusy } = useDocument()
  const currentDocRef = useRef<DocumentState | null>(doc)
  currentDocRef.current = doc
  const [mode, setMode] = useState<RasterMode>(initialMode ?? 'grayscale')
  const [quality, setQuality] = useState<CompressionQuality>('medium')
  const [stage, setStage] = useState<DialogStage>(null)
  const [progress, setProgress] = useState<RasterProgress>(EMPTY_PROGRESS)
  const [candidate, setCandidate] = useState<RasterCandidate | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  useEffect(() => {
    onBusyChange?.(stage !== null)
  }, [stage, onBusyChange])

  useEffect(() => {
    if (candidate && candidate.sourceBytes !== doc?.bytes) {
      setCandidate(null)
      setStage(null)
    }
  }, [candidate, doc])

  const operationName = mode === 'grayscale'
    ? t.viewer.grayscaleName
    : t.viewer.compressName

  const openWarning = () => {
    setCandidate(null)
    setProgress(EMPTY_PROGRESS)
    setStage('warning')
  }

  const prepareCandidate = async () => {
    const source = currentDocRef.current
    if (!source) return
    const selectedMode = mode
    const selectedOperationName = operationName
    setStage('processing')
    setProgress({ completedPages: 0, totalPages: source.pageIds.length, percent: 0 })

    try {
      // 先に小窓を描画させてから重いページ処理へ入る。
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      const originalPreview = await renderPageThumbnail(source.pdfDoc, 1, 1)
      if (!originalPreview) throw new OperationError(t.viewer.rasterPreviewFailed)

      const settings = selectedMode === 'grayscale'
        ? { ...GRAYSCALE_RASTER_SETTINGS, grayscale: true }
        : { ...compressionSettings[quality], grayscale: false }
      const pages = await rasterizeOpenPdfPages(source.pdfDoc, settings, setProgress)
      const input = { bytes: source.bytes.slice(), pageIds: [...source.pageIds] }
      const result = selectedMode === 'grayscale'
        ? await grayscaleFromRasterPages(input, pages)
        : await compressFromRasterPages(input, pages)
      pages.length = 0

      const resultDoc = await loadPdfFromBytes(result.bytes)
      let resultPreview = ''
      try {
        resultPreview = await renderPageThumbnail(resultDoc, 1, 1)
      } finally {
        releasePdf(resultDoc)
      }
      if (!resultPreview) throw new OperationError(t.viewer.rasterPreviewFailed)

      // 処理中に別文書へ切り替わっていたら、古い結果を候補にしない。
      if (currentDocRef.current !== source) {
        setStage(null)
        return
      }
      const inspection = inspectCompressionCandidate(source.bytes.byteLength, result.bytes.byteLength)
      setCandidate({
        ...result,
        operationName: selectedOperationName,
        originalPreview,
        resultPreview,
        originalSize: source.bytes.byteLength,
        resultSize: result.bytes.byteLength,
        canApply: selectedMode === 'grayscale' || inspection.canReplace,
        sourceBytes: source.bytes,
        sourcePageIds: [...source.pageIds],
      })
      setStage('result')
    } catch (error) {
      console.error(error)
      toast.error(toUserMessage(error))
      setCandidate(null)
      setStage(null)
    }
  }

  const applyCandidate = async () => {
    if (!candidate || !candidate.canApply) return
    setIsApplying(true)
    try {
      const applied = await applyOperation(async (input) => {
        return applyPreparedRasterCandidate(input, {
          sourceBytes: candidate.sourceBytes,
          sourcePageIds: candidate.sourcePageIds,
          result: candidate,
        })
      })
      if (applied) {
        toast.success(t.viewer.rasterApplied(candidate.operationName))
        setCandidate(null)
        setStage(null)
        onApplied?.()
      }
    } catch (error) {
      console.error(error)
      toast.error(toUserMessage(error))
    } finally {
      setIsApplying(false)
    }
  }

  const modeClass = (active: boolean) => `rounded-xl px-3 py-3 text-xs font-bold transition-all disabled:opacity-30 ${
    active
      ? 'bg-rose-500 text-white shadow-md'
      : 'bg-gray-100 text-gray-500 hover:text-rose-500 dark:bg-zinc-800 dark:text-zinc-400'
  }`

  return (
    <div className="space-y-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-black text-gray-700 dark:text-zinc-200">
          <Palette size={16} className="text-rose-500" />
          {t.viewer.rasterHeading}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-gray-400">{t.viewer.rasterHint}</p>
      </div>

      {initialMode === undefined && (
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="raster-mode-grayscale"
          aria-pressed={mode === 'grayscale'}
          onClick={() => setMode('grayscale')}
          disabled={isBusy || stage !== null}
          className={modeClass(mode === 'grayscale')}
        >
          <Palette size={15} className="mx-auto mb-1" />
          {t.viewer.grayscaleAction}
        </button>
        <button
          type="button"
          data-testid="raster-mode-compress"
          aria-pressed={mode === 'compress'}
          onClick={() => setMode('compress')}
          disabled={isBusy || stage !== null}
          className={modeClass(mode === 'compress')}
        >
          <Zap size={15} className="mx-auto mb-1" />
          {t.viewer.compressAction}
        </button>
      </div>
      )}

      {mode === 'compress' && (
        <fieldset>
          <legend className="text-xs font-bold text-gray-500 dark:text-zinc-300">
            {t.viewer.compressQuality}
          </legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {QUALITY_CHOICES.map((choice) => (
              <button
                key={choice.id}
                type="button"
                aria-pressed={quality === choice.id}
                title={choice.hint}
                onClick={() => setQuality(choice.id)}
                disabled={isBusy || stage !== null}
                className={`rounded-xl px-1 py-2.5 text-xs font-bold transition-all disabled:opacity-30 ${
                  quality === choice.id
                    ? 'bg-rose-500 text-white'
                    : 'bg-gray-100 text-gray-400 dark:bg-zinc-800'
                }`}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <button
        type="button"
        data-testid="raster-run"
        onClick={openWarning}
        disabled={isBusy || stage !== null}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 py-3.5 text-sm font-black text-white shadow-lg shadow-rose-500/20 hover:bg-rose-600 disabled:opacity-30"
      >
        {mode === 'grayscale' ? <Palette size={16} /> : <Zap size={16} />}
        {mode === 'grayscale' ? t.viewer.grayscaleAction : t.viewer.compressAction}
      </button>

      {/*
        確認・進行・結果の窓は画面の一番上に直接出す。設定の小窓はその間隠れるので、
        画面を覆う層が1枚で済む（大きなPDFで窓を動かしても描き直しが重くならない）
      */}
      {stage !== null && createPortal(<>
      {stage === 'warning' && (
        <LossyOperationGuard
          operationName={operationName}
          losses={RASTERIZATION_INFORMATION_LOSSES}
          onProceed={prepareCandidate}
          onCancel={() => setStage(null)}
        />
      )}
      {stage === 'processing' && (
        <RasterProgressDialog operationName={operationName} {...progress} />
      )}
      {stage === 'result' && candidate && (
        <RasterResultDialog
          operationName={candidate.operationName}
          originalPreview={candidate.originalPreview}
          resultPreview={candidate.resultPreview}
          originalSize={candidate.originalSize}
          resultSize={candidate.resultSize}
          canApply={candidate.canApply}
          isApplying={isApplying}
          onApply={applyCandidate}
          onCancel={() => {
            setCandidate(null)
            setStage(null)
          }}
        />
      )}
      </>, document.body)}
    </div>
  )
}
