import { RefObject, useRef } from 'react'
import {
  FolderOpen, Save, Undo2, Redo2, FilePlus2, RotateCcw, RotateCw, Trash2, FileOutput,
  Crop, PenTool, Sparkles, Download, KeyRound, Type, Hash, Info, Palette, Zap, Images,
  ImageDown, FileText, FileArchive, X, Loader2,
} from 'lucide-react'
import { DocumentState, useDocument } from '../../../document/documentSession'
import { PagesExportMode } from '../../../exports/pagesExport'
import { t } from '../../../i18n/ja'
import ToolbarMenu from './ToolbarMenu'
import { bigButtonClass, separatorClass } from './ui'

export type ToolId =
  | 'crop' | 'watermark' | 'pageNumber' | 'metadata' | 'grayscale' | 'compress'
  | 'exportImages' | 'exportEmbedded' | 'exportText' | 'savePassword'

interface DocumentToolbarProps {
  doc: DocumentState
  selectedCount: number
  /** 選んだページを取り出している最中か（編集中のPDFは変えないので isBusy とは別） */
  isExtracting?: boolean
  onOpenFile: (file: File) => void
  onSave: () => void
  onAddSource: (kind: 'pdf' | 'images') => void
  onRotate: (delta: 90 | -90) => void
  onDelete: () => void
  onExtract: (mode: PagesExportMode) => void
  onOpenSignature: () => void
  onOpenTool: (tool: ToolId) => void
  onClose: () => void
  titleRef: RefObject<HTMLHeadingElement>
}

const icon = (Icon: typeof Save) => <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
const smallIcon = (Icon: typeof Save) => <Icon size={16} aria-hidden="true" />

/** 編集画面の上部。1段目にファイル名と閉じる、2段目に操作のボタン列 */
export default function DocumentToolbar(props: DocumentToolbarProps) {
  const { doc, selectedCount } = props
  const { isBusy, canUndo, canRedo, undo, redo } = useDocument()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const needsSelection = selectedCount === 0
  const selectionTitle = (base: string) => (needsSelection ? t.viewer.toolNeedsSelection : base)
  const signatureTitle = selectedCount === 0
    ? t.viewer.toolNeedsSelection
    : selectedCount > 1 ? t.viewer.toolNeedsOnePage : t.viewer.signatureImageHeading

  return (
    <div className="mb-3 bg-white dark:bg-zinc-900 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm sticky top-20 z-20">
      <div className="flex items-center gap-3 px-5 pt-3">
        <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-500 flex items-center justify-center shrink-0">
          {isBusy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
        </div>
        <h1
          ref={props.titleRef}
          tabIndex={-1}
          data-document-focus-fallback
          className="flex-1 min-w-0 truncate text-sm font-bold dark:text-white"
        >
          {doc.name}.pdf
          <span className="ml-2 text-xs font-bold text-gray-400">
            {isBusy ? t.viewer.working : t.viewer.pageCount(doc.pageIds.length)}
            {doc.isDirty && ` ・ ${t.viewer.unsavedMark}`}
          </span>
        </h1>
        <button
          type="button"
          onClick={props.onClose}
          disabled={isBusy}
          aria-label={t.viewer.closeDocument}
          className="p-2 text-gray-400 hover:text-rose-500 transition-colors disabled:opacity-30"
        >
          <X size={18} />
        </button>
      </div>

      <div
        role="toolbar"
        aria-label={t.viewer.toolbarLabel}
        className="flex flex-wrap items-stretch gap-y-1 gap-x-0.5 px-3 pb-2 pt-1"
      >
        <input
          ref={fileInputRef}
          data-testid="open-pdf-input"
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) props.onOpenFile(file)
          }}
        />
        <button type="button" className={bigButtonClass} disabled={isBusy} onClick={() => fileInputRef.current?.click()}>
          {icon(FolderOpen)}{t.viewer.toolOpen}
        </button>
        <ToolbarMenu label={t.viewer.toolSave} icon={icon(Save)} disabled={isBusy} items={[
          { id: 'save', label: t.viewer.toolSaveNormal, icon: smallIcon(Save), onSelect: props.onSave },
          { id: 'savePassword', label: t.viewer.toolSavePassword, icon: smallIcon(KeyRound), onSelect: () => props.onOpenTool('savePassword') },
        ]} />
        <span className={separatorClass} aria-hidden="true" />

        <button type="button" className={bigButtonClass} disabled={isBusy || !canUndo} title={t.viewer.undoHint} onClick={() => void undo()}>
          {icon(Undo2)}{t.viewer.undo}
        </button>
        <button type="button" className={bigButtonClass} disabled={isBusy || !canRedo} title={t.viewer.redoHint} onClick={() => void redo()}>
          {icon(Redo2)}{t.viewer.redo}
        </button>
        <span className={separatorClass} aria-hidden="true" />

        <ToolbarMenu label={t.viewer.toolAddPdf} icon={icon(FilePlus2)} disabled={isBusy} items={[
          { id: 'addPdf', label: t.viewer.toolAddFromPdf, icon: smallIcon(FilePlus2), onSelect: () => props.onAddSource('pdf') },
          { id: 'addImages', label: t.viewer.toolAddFromImages, icon: smallIcon(Images), onSelect: () => props.onAddSource('images') },
        ]} />
        <button type="button" className={bigButtonClass} disabled={isBusy || needsSelection} title={selectionTitle(t.viewer.toolRotateLeft)} onClick={() => props.onRotate(-90)}>
          {icon(RotateCcw)}{t.viewer.toolRotateLeft}
        </button>
        <button type="button" className={bigButtonClass} disabled={isBusy || needsSelection} title={selectionTitle(t.viewer.toolRotateRight)} onClick={() => props.onRotate(90)}>
          {icon(RotateCw)}{t.viewer.toolRotateRight}
        </button>
        <button type="button" className={bigButtonClass} disabled={isBusy || needsSelection} title={selectionTitle(t.viewer.deletePagesHint)} onClick={props.onDelete}>
          {icon(Trash2)}{t.viewer.toolDelete}
        </button>
        <ToolbarMenu
          label={t.viewer.toolExtract}
          icon={icon(FileOutput)}
          disabled={isBusy || needsSelection || props.isExtracting}
          title={props.isExtracting ? t.viewer.exporting : selectionTitle(t.viewer.toolExtract)}
          items={[
            { id: 'single', label: t.viewer.toolExtractSingle, icon: smallIcon(FileOutput), onSelect: () => props.onExtract('single') },
            { id: 'separate', label: t.viewer.toolExtractSeparate, icon: smallIcon(FileArchive), onSelect: () => props.onExtract('separate') },
          ]}
        />
        <button type="button" className={bigButtonClass} disabled={isBusy} onClick={() => props.onOpenTool('crop')}>
          {icon(Crop)}{t.viewer.toolCrop}
        </button>
        <button type="button" className={bigButtonClass} disabled={isBusy || selectedCount !== 1} title={signatureTitle} onClick={props.onOpenSignature}>
          {icon(PenTool)}{t.viewer.toolSignature}
        </button>
        <span className={separatorClass} aria-hidden="true" />

        <ToolbarMenu label={t.viewer.toolFinish} icon={icon(Sparkles)} disabled={isBusy} items={[
          { id: 'watermark', label: t.viewer.toolWatermark, icon: smallIcon(Type), onSelect: () => props.onOpenTool('watermark') },
          { id: 'pageNumber', label: t.viewer.toolPageNumber, icon: smallIcon(Hash), onSelect: () => props.onOpenTool('pageNumber') },
          { id: 'metadata', label: t.viewer.toolMetadata, icon: smallIcon(Info), onSelect: () => props.onOpenTool('metadata') },
          { id: 'grayscale', label: t.viewer.toolGrayscale, icon: smallIcon(Palette), onSelect: () => props.onOpenTool('grayscale') },
          { id: 'compress', label: t.viewer.toolCompress, icon: smallIcon(Zap), onSelect: () => props.onOpenTool('compress') },
        ]} />
        <ToolbarMenu label={t.viewer.toolExport} icon={icon(Download)} disabled={isBusy} items={[
          { id: 'exportImages', label: t.viewer.toolExportImages, icon: smallIcon(Images), onSelect: () => props.onOpenTool('exportImages') },
          { id: 'exportEmbedded', label: t.viewer.toolExportEmbedded, icon: smallIcon(ImageDown), onSelect: () => props.onOpenTool('exportEmbedded') },
          { id: 'exportText', label: t.viewer.toolExportText, icon: smallIcon(FileText), onSelect: () => props.onOpenTool('exportText') },
        ]} />
      </div>
    </div>
  )
}
