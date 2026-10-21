/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { useEffect, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, closestCenter,
  DragStartEvent, DragMoveEvent, DragEndEvent,
  MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Files } from 'lucide-react'
import { toast } from 'sonner'

import { useDocument } from '../../document/documentSession'
import { reorderPages } from '../../operations/pageOps'
import { addFromPdf } from '../../operations/addOp'
import { downloadFile } from '../../utils/pdfHelpers'
import { toUserMessage } from '../../utils/userMessage'
import { t } from '../../i18n/ja'
import OpenDocumentScreen from './OpenDocumentScreen'
import UnsavedGuard from './UnsavedGuard'
import PageGrid, { InsertMarker } from './PageGrid'
import PageZoom from './PageZoom'
import ImportPane, { IMPORT_DRAG_TYPE } from './ImportPane'
import { ImportSource, readImageSource, readPdfSource } from './ImportSourcePicker'
import { openPdfFile } from './openPdf'
import DocumentToolbar, { ToolId } from './toolbar/DocumentToolbar'
import ToolDialog from './toolbar/ToolDialog'
import PageContextMenu from './toolbar/PageContextMenu'
import StatusStrip from './toolbar/StatusStrip'
import { usePageActions } from './toolbar/usePageActions'
import { selectionForContextMenu } from './toolbar/contextSelection'
import { isTextEntryTarget } from './toolbar/keyTarget'
import { singleSelectedPageNumber } from './toolbar/pageTargets'
import CropSettings from './panels/CropSettings'
import WatermarkSettings from './panels/WatermarkSettings'
import PageNumberSettings from './panels/PageNumberSettings'
import MetadataPanel from './panels/MetadataPanel'
import RasterPanel from './panels/RasterPanel'
import PdfImagesExportSection from './panels/PdfImagesExportSection'
import EmbeddedImagesExportSection from './panels/EmbeddedImagesExportSection'
import TextExportSection from './panels/TextExportSection'
import PasswordSaveSettings from './panels/PasswordSaveSettings'
import PrivacyBadge from '../tools/shared/PrivacyBadge'
import DigitalSignatureGuard from './DigitalSignatureGuard'
import ConfirmGuard from './ConfirmGuard'
import OpenFailurePrompt from './OpenFailurePrompt'

/** 設定の小窓の見出し */
const TOOL_TITLES: Record<ToolId, string> = {
  crop: t.viewer.toolCrop,
  watermark: t.viewer.toolWatermark,
  pageNumber: t.viewer.toolPageNumber,
  metadata: t.viewer.toolMetadata,
  grayscale: t.viewer.toolGrayscale,
  compress: t.viewer.toolCompress,
  exportImages: t.viewer.toolExportImages,
  exportEmbedded: t.viewer.toolExportEmbedded,
  exportText: t.viewer.toolExportText,
  savePassword: t.viewer.toolSavePassword,
}

/**
 * ビューアー主画面。
 * PDFを開いて、そのまま操作を加えていく画面。
 *
 * **ドラッグの土台（DndContext）はここに置く。** 左のページ一覧の並べ替えと、
 * 右の取り込み元から左へ持ってくる操作の両方を、1つの土台で扱うため。
 * 選択状態も、左（selected）・右（importPicked）ともここが持つ。
 */
export default function DocumentViewer() {
  const {
    doc, documentKey, isBusy, undo, redo, undoLimit,
    openDocument, closeDocument, applyOperation, markSaved,
    signatureWarningStatus, answerSignatureWarning,
    historyWarningDrops, answerHistoryWarning,
    openFailure,
  } = useDocument()

  const [zoomPage, setZoomPage] = useState<number | null>(null)
  const [zoomStartsWithSignature, setZoomStartsWithSignature] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const lastDocumentFocusRef = useRef<HTMLElement | null>(null)
  const documentTitleRef = useRef<HTMLHeadingElement>(null)
  const restoreSignatureFocusRef = useRef(false)

  useEffect(() => {
    if (
      !restoreSignatureFocusRef.current || isBusy
      || signatureWarningStatus || historyWarningDrops !== null
    ) return

    const frame = requestAnimationFrame(() => {
      const previous = lastDocumentFocusRef.current
      const target = previous?.isConnected && !previous.matches(':disabled, [aria-disabled="true"]')
        ? previous
        : documentTitleRef.current

      target?.focus()
      restoreSignatureFocusRef.current = false
    })
    return () => cancelAnimationFrame(frame)
  }, [isBusy, signatureWarningStatus, historyWarningDrops])

  const answerSignatureGuard = (proceed: boolean) => {
    restoreSignatureFocusRef.current = true
    answerSignatureWarning(proceed)
  }

  const answerHistoryGuard = (proceed: boolean) => {
    restoreSignatureFocusRef.current = true
    answerHistoryWarning(proceed)
  }

  /** 保存していない変更があるまま「閉じる」を押したときの確認 */
  const [showCloseGuard, setShowCloseGuard] = useState(false)

  /** 取り込み元。開いている間だけ、右のパネルが取り込みパネルに変わる */
  const [importSource, setImportSource] = useState<ImportSource | null>(null)
  /** 取り込み元で選ばれているページ（0始まりの番号） */
  const [importPicked, setImportPicked] = useState<Set<number>>(new Set())

  /**
   * ドラッグを離した直後の並び。
   *
   * 並べ替えは裏でPDFを作り直すため一瞬かかる。その間これを表示しないと、
   * 見た目が元の並びに戻って「掴んだのに動かない」ように見える。
   */
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null)

  /** 取り込み元のページを、今どこに落とそうとしているか */
  const [insertMarker, setInsertMarker] = useState<InsertMarker | null>(null)
  /** ドラッグ中に運んでいる取り込み元のページ数（マウスに付いてくる表示用） */
  const [draggingImportCount, setDraggingImportCount] = useState(0)
  /** 左の一覧で、今まとめて動かしているページ */
  const [movingPageIds, setMovingPageIds] = useState<Set<string> | null>(null)

  /**
   * ドラッグの最中と終わりで見る値は ref でも持つ。
   * 離した瞬間の処理は、直前の描き直しが終わる前に走ることがあるため。
   */
  const insertMarkerRef = useRef<InsertMarker | null>(null)
  const draggingImportRef = useRef<number[] | null>(null)
  /** 左の一覧で動かすページ。掴んだ時点で決め、離すときもこれを使う */
  const movingPagesRef = useRef<string[] | null>(null)

  /** Shift+クリックの起点になるページ */
  const anchorRef = useRef<string | null>(null)
  /** 直前にドラッグが終わった時刻。離した直後のクリックを無視するのに使う */
  const dragEndedAtRef = useRef(0)

  /** 設定の小窓。開いている道具の種類 */
  const [openTool, setOpenTool] = useState<ToolId | null>(null)
  /** 白黒化などの処理中は、小窓を閉じさせない */
  const [toolLocked, setToolLocked] = useState(false)
  /** ページの右クリックメニュー */
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, pageId: string } | null>(null)
  /** 未保存のまま「開く」で選ばれたPDF。確認の後に開く */
  const [pendingOpenFile, setPendingOpenFile] = useState<File | null>(null)
  const importPdfInputRef = useRef<HTMLInputElement>(null)
  const importImageInputRef = useRef<HTMLInputElement>(null)

  const pageActions = usePageActions(doc, selected)
  // 右クリックの直後は選択の更新が画面へ届く前なので、対象はメニューを開いたページから決める
  const contextTargets = contextMenu ? selectionForContextMenu(selected, contextMenu.pageId) : selected

  const closeTool = () => {
    setOpenTool(null)
    setToolLocked(false)
  }

  const pageIds = doc?.pageIds

  // 今の文書に無いページIDを選択から外す。
  // 消えたページIDが残ると、操作が「ページが見つかりません」で失敗する
  useEffect(() => {
    if (!pageIds) {
      setSelected(new Set())
      setImportSource(null) // 文書を閉じたら取り込みパネルも畳む
      setOpenTool(null)
      setToolLocked(false)
      setContextMenu(null)
      return
    }
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const alive = new Set(pageIds)
      const next = new Set([...prev].filter((id) => alive.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [pageIds])

  // 別の文書に差し替わったら、前の文書の取り込み元・小窓・メニューを片付ける。
  // 開けなかったとき（パスワード入力などの案内）も、その案内を小窓の下に隠さない
  useEffect(() => {
    setImportSource(null)
    setImportPicked(new Set())
    setOpenTool(null)
    setToolLocked(false)
    setContextMenu(null)
  }, [documentKey])
  useEffect(() => {
    if (!openFailure) return
    setOpenTool(null)
    setToolLocked(false)
    setContextMenu(null)
  }, [openFailure])

  // 本物の並びが更新されたら、暫定の並びは捨てる
  useEffect(() => {
    setPendingOrder(null)
  }, [pageIds])

  // Ctrl+A で全選択、Esc で選択解除、Delete で削除、Ctrl+Z で元に戻す、Ctrl+Y／Ctrl+Shift+Z でやり直し。
  // 拡大表示を開いている間は効かせない。文字の入力中と、小窓が出ている間も効かせない
  // （入力欄そのものの取り消しや全選択に任せる）
  useEffect(() => {
    if (!pageIds || zoomPage !== null) return
    const onKeyDown = (e: KeyboardEvent) => {
      // ▼メニューや右クリックメニューを開いている間も、ページには効かせない
      if (
        isTextEntryTarget(e.target)
        || document.querySelector('[aria-modal="true"], [role="menu"]')
      ) return
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
        e.preventDefault()
        if (key === 'y' || e.shiftKey) void redo()
        else void undo()
      } else if ((e.ctrlKey || e.metaKey) && key === 'a') {
        e.preventDefault()
        setSelected(new Set(pageIds))
      } else if (e.key === 'Escape') {
        setSelected(new Set())
      } else if (e.key === 'Delete' && selected.size > 0) {
        // 消してもすぐ「元に戻す」で戻せるので、確認は出さない（ボタンと同じ扱い）
        e.preventDefault()
        void pageActions.remove()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pageIds, zoomPage, undo, redo, selected, pageActions.remove])

  const sensors = useSensors(
    // 8px 動かすまではドラッグを始めない。こうしないとダブルクリックが拾えない
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const order = pendingOrder ?? doc?.pageIds ?? []

  const setMarker = (next: InsertMarker | null) => {
    insertMarkerRef.current = next
    setInsertMarker(next)
  }

  /**
   * 取り込み元から、選んだページを入れる。
   * **ボタンからもドラッグからも、入り口はこの1本だけにする。**
   */
  const insertFromImport = async (indices: number[], insertAtPageId: string | null) => {
    if (!importSource || indices.length === 0) return
    try {
      let added = 0
      await applyOperation(async (input) => {
        const result = await addFromPdf(input, importSource.bytes, insertAtPageId, indices)
        added = result.pageIds.length - input.pageIds.length
        return result
      })
      if (added > 0) {
        toast.success(t.viewer.addedToast(added))
        setImportPicked(new Set()) // 続けて別のページを選べるよう、選択だけ外す
      }
    } catch (err) {
      console.error(err)
      toast.error(toUserMessage(err))
    }
  }

  /** 掴んだ取り込み元のページ。選択に入っていればまとめて、入っていなければその1枚 */
  const importDragIndices = (index: number) =>
    importPicked.has(index) && importPicked.size > 1
      ? [...importPicked].sort((a, b) => a - b)
      : [index]

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current

    if (data?.type === IMPORT_DRAG_TYPE) {
      const indices = importDragIndices(data.index as number)
      draggingImportRef.current = indices
      setDraggingImportCount(indices.length)
      return
    }

    // 左の一覧。選択に入っていないページを掴んだら、そのページ1枚の選択にしてから始める。
    // 「選択外を掴んだのに選択中のものが動く」事故を防ぐ
    const id = event.active.id as string
    let active = selected
    if (!selected.has(id)) {
      anchorRef.current = id
      active = new Set([id])
      setSelected(active)
    }

    // まとめて動かすページを、掴んだ時点で決めておく。
    // 並びは選んだ順ではなく元の並び順を保つ
    const moving = active.size > 1 ? order.filter((p) => active.has(p)) : [id]
    movingPagesRef.current = moving
    setMovingPageIds(new Set(moving))
  }

  /** 取り込み元を運んでいる間、どのページの手前／後ろに入るかを追いかける */
  const handleDragMove = (event: DragMoveEvent) => {
    if (event.active.data.current?.type !== IMPORT_DRAG_TYPE) return

    const over = event.over
    const activeRect = event.active.rect.current.translated
    if (!over || !activeRect || !order.includes(over.id as string)) {
      if (insertMarkerRef.current) setMarker(null)
      return
    }

    // 掴んでいるものの中心が、相手のページの中心より左なら「前」、右なら「後ろ」
    const activeCenterX = activeRect.left + activeRect.width / 2
    const overCenterX = over.rect.left + over.rect.width / 2
    const side = activeCenterX < overCenterX ? 'before' : 'after'

    const current = insertMarkerRef.current
    if (current?.pageId === over.id && current.side === side) return
    setMarker({ pageId: over.id as string, side })
  }

  const finishDrag = () => {
    dragEndedAtRef.current = Date.now()
    setMarker(null)
    draggingImportRef.current = null
    setDraggingImportCount(0)
    movingPagesRef.current = null
    setMovingPageIds(null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const isImport = event.active.data.current?.type === IMPORT_DRAG_TYPE
    const marker = insertMarkerRef.current
    const indices = draggingImportRef.current
    const moving = movingPagesRef.current
    finishDrag()

    // --- 取り込み元から持ってきた場合 ---
    if (isImport) {
      // 一覧の外で離したときは何もしない（黙って末尾に入ったりしない）
      if (!marker || !indices) return
      const at = order.indexOf(marker.pageId)
      const insertAtPageId = marker.side === 'before' ? marker.pageId : (order[at + 1] ?? null)
      await insertFromImport(indices, insertAtPageId)
      return
    }

    // --- 左の一覧の並べ替え ---
    const { active, over } = event
    if (!over || active.id === over.id || !moving) return

    const activeId = active.id as string
    const overId = over.id as string
    const movingSet = new Set(moving)

    // 動かすページ自身の上に落とされたときは、行き先が決まらないので何もしない
    if (movingSet.has(overId)) return

    const rest = order.filter((id) => !movingSet.has(id))
    let insertAt = rest.indexOf(overId)
    if (insertAt < 0) return
    // 後ろへ動かすときは、落とした先の手前ではなく後ろへ入れる
    if (order.indexOf(overId) > order.indexOf(activeId)) insertAt += 1

    const next = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)]
    setPendingOrder(next)

    try {
      // 先に新しい並びを1度描画してから、PDF本体の重い作り直しへ進む。
      // 大型PDFでも「離したのに動かない」ように見える時間を作らないため。
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const applied = await applyOperation((input) => reorderPages(input, next))
      if (!applied) setPendingOrder(null)
    } catch (err) {
      // 失敗したら見た目も元に戻す（成功したように見せない）
      setPendingOrder(null)
      console.error(err)
      toast.error(toUserMessage(err))
    }
  }

  /**
   * 保存。Windows の「名前を付けて保存」が出る。
   * 取り消し（キャンセル）は失敗ではないので、赤いお知らせにしない。
   */
  const handleSave = async () => {
    if (!doc) return
    try {
      const ok = await downloadFile(doc.bytes, `${doc.name}.pdf`, 'application/pdf')
      if (ok) {
        markSaved()
        toast.success(t.viewer.savedToast)
      } else {
        toast.info(t.viewer.saveCanceled)
      }
    } catch (err) {
      // 保存の失敗は英語で出るので、そのまま見せずに日本語のお知らせに置き換える
      console.error(err)
      toast.error(t.errors.saveFailed)
    }
  }

  /** 「閉じる」。保存していない変更があるときだけ確認を挟む */
  const handleCloseRequest = () => {
    if (doc?.isDirty) {
      setShowCloseGuard(true)
      return
    }
    closeDocument()
  }

  /** 確認の小窓は必ず閉じてから文書を閉じる（次に開いたとき出たままにならないように） */
  const discardAndClose = () => {
    setShowCloseGuard(false)
    closeDocument()
  }

  if (!doc) return <OpenDocumentScreen />

  return (
    <div
      className="max-w-7xl mx-auto px-6 py-6 pb-24"
      onFocusCapture={(event) => {
        // 警告内へ移った後も、警告を出す直前の操作場所を覚えておく。
        const target = event.target as HTMLElement
        if (!target.closest('[role="alertdialog"]')) lastDocumentFocusRef.current = target
      }}
      onClickCapture={(event) => {
        // ボタンが処理中で一時的に無効になるより前に、押した場所を控える。
        const target = (event.target as HTMLElement).closest<HTMLElement>('button, [href], input, select, textarea, [tabindex]')
        if (target && !target.closest('[role="alertdialog"]')) lastDocumentFocusRef.current = target
      }}
    >
      <DocumentToolbar
        doc={doc}
        selectedCount={selected.size}
        isExtracting={pageActions.isExtracting}
        titleRef={documentTitleRef}
        onOpenFile={(file) => {
          if (doc.isDirty) setPendingOpenFile(file)
          else void openPdfFile(file, openDocument)
        }}
        onSave={handleSave}
        onAddSource={(kind) => {
          if (kind === 'pdf') importPdfInputRef.current?.click()
          else importImageInputRef.current?.click()
        }}
        onRotate={pageActions.rotate}
        onDelete={() => void pageActions.remove()}
        onExtract={pageActions.extract}
        onOpenSignature={() => {
          const pageNumber = singleSelectedPageNumber(doc.pageIds, selected)
          if (!pageNumber) return
          setZoomStartsWithSignature(true)
          setZoomPage(pageNumber)
        }}
        onOpenTool={setOpenTool}
        onClose={handleCloseRequest}
      />

      {/* 「PDFを追加」で開くファイル選択。画面検査が選べるよう、画面の中に置いておく */}
      <input
        ref={importPdfInputRef}
        data-testid="import-pdf-input"
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = '' // 同じファイルを続けて選べるようにする
          const source = file ? await readPdfSource(file) : null
          if (source) setImportSource(source)
        }}
      />
      <input
        ref={importImageInputRef}
        data-testid="import-image-input"
        type="file"
        accept="image/png,image/jpeg"
        multiple
        className="hidden"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          const source = files.length > 0 ? await readImageSource(files) : null
          if (source) setImportSource(source)
        }}
      />

      <StatusStrip
        selectedCount={selected.size}
        undoLimit={undoLimit}
        onClear={() => setSelected(new Set())}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={finishDrag}
      >
        {/*
          ふだんはページの一覧を全幅で出す。
          取り込み元を開いている間だけ、右半分に取り込みパネルを出す。狭い画面では縦に並ぶ
        */}
        <div className={importSource ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 items-start' : ''}>
          {/*
            取り込み元のページを運んでいる間は、落とし先がここだと分かるよう枠で囲む。
            枠は outline にしてページの位置を動かさない（動くと入る位置の判定がずれる）
          */}
          <div
            data-testid="import-drop-zone"
            data-active={draggingImportCount > 0 ? 'true' : 'false'}
            className={`rounded-3xl transition-colors ${
              draggingImportCount > 0
                ? 'outline-dashed outline-2 outline-offset-8 outline-rose-400 bg-rose-50/40 dark:bg-rose-900/10'
                : ''
            }`}
          >
            <PageGrid
              order={order}
              // 並べ替えの反映を待っている間は絵を描かせない。
              // 表示は新しい並び・PDFはまだ古いので、この隙に描くと
              // 別のページの絵をそのページのものとして覚えてしまう
              pdfDoc={pendingOrder ? null : doc.pdfDoc}
              onZoom={(pageNumber) => {
                setZoomStartsWithSignature(false)
                setZoomPage(pageNumber)
              }}
              selected={selected}
              onSelectionChange={setSelected}
              columns={importSource ? 'narrow' : 'wide'}
              insertMarker={insertMarker}
              movingPageIds={movingPageIds}
              anchorRef={anchorRef}
              dragEndedAtRef={dragEndedAtRef}
              onContextMenu={(pageId, x, y) => {
                setSelected((prev) => selectionForContextMenu(prev, pageId))
                anchorRef.current = pageId
                setContextMenu({ x, y, pageId })
              }}
            />
          </div>

          {importSource && (
            <div className="lg:sticky lg:top-60">
              <ImportPane
                source={importSource}
                onClose={() => setImportSource(null)}
                picked={importPicked}
                onPickedChange={setImportPicked}
                onInsert={insertFromImport}
                dragEndedAtRef={dragEndedAtRef}
              />
            </div>
          )}
        </div>

        {/* 取り込み元を運んでいる間、マウスに付いてくる目印 */}
        <DragOverlay dropAnimation={null}>
          {draggingImportCount > 0 ? (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-500 text-white text-xs font-black shadow-2xl shadow-rose-500/40 whitespace-nowrap w-max">
              <Files size={16} />
              <div>
                <p>{t.viewer.movingPages(draggingImportCount)}</p>
                <p className="text-[10px] font-bold text-rose-100">{t.viewer.importDropHere}</p>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {openTool && (
        <ToolDialog
          title={TOOL_TITLES[openTool]}
          locked={toolLocked || isBusy}
          concealed={toolLocked && (openTool === 'grayscale' || openTool === 'compress')}
          onClose={closeTool}
        >
          {openTool === 'crop' && <CropSettings doc={doc} selected={selected} onApplied={closeTool} />}
          {openTool === 'watermark' && <WatermarkSettings onApplied={closeTool} />}
          {openTool === 'pageNumber' && <PageNumberSettings onApplied={closeTool} />}
          {openTool === 'metadata' && <MetadataPanel onApplied={closeTool} />}
          {(openTool === 'grayscale' || openTool === 'compress') && (
            <RasterPanel initialMode={openTool} onBusyChange={setToolLocked} onApplied={closeTool} />
          )}
          {openTool === 'exportImages' && <PdfImagesExportSection doc={doc} selected={selected} onBusyChange={setToolLocked} />}
          {openTool === 'exportEmbedded' && <EmbeddedImagesExportSection doc={doc} onBusyChange={setToolLocked} />}
          {openTool === 'exportText' && <TextExportSection doc={doc} selected={selected} onBusyChange={setToolLocked} />}
          {openTool === 'savePassword' && <PasswordSaveSettings doc={doc} onSaved={closeTool} onBusyChange={setToolLocked} />}
        </ToolDialog>
      )}

      {contextMenu && (
        <PageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onRotate={(delta) => void pageActions.rotate(delta, contextTargets)}
          onDelete={() => void pageActions.remove(contextTargets)}
          onExtract={() => void pageActions.extract('single', contextTargets)}
          onZoom={() => {
            const pageNumber = doc.pageIds.indexOf(contextMenu.pageId) + 1
            if (pageNumber < 1) return
            setZoomStartsWithSignature(false)
            setZoomPage(pageNumber)
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {pendingOpenFile && (
        <UnsavedGuard
          body={t.viewer.unsavedOpenBody}
          discardLabel={t.viewer.unsavedOpenDiscard}
          onDiscard={() => {
            const file = pendingOpenFile
            setPendingOpenFile(null)
            void openPdfFile(file, openDocument)
          }}
          onCancel={() => setPendingOpenFile(null)}
        />
      )}

      {zoomPage !== null && (
        <PageZoom
          pdfDoc={doc.pdfDoc}
          totalPages={doc.pageIds.length}
          startPage={zoomPage}
          startInSignatureMode={zoomStartsWithSignature}
          onClose={() => {
            setZoomPage(null)
            setZoomStartsWithSignature(false)
          }}
        />
      )}

      {showCloseGuard && (
        <UnsavedGuard
          onDiscard={discardAndClose}
          onCancel={() => setShowCloseGuard(false)}
        />
      )}

      {signatureWarningStatus && (
        <DigitalSignatureGuard
          status={signatureWarningStatus}
          onProceed={() => answerSignatureGuard(true)}
          onCancel={() => answerSignatureGuard(false)}
        />
      )}

      {historyWarningDrops !== null && (
        <ConfirmGuard
          title={t.viewer.historyLimitTitle}
          body={t.viewer.historyLimitBody(historyWarningDrops)}
          proceedLabel={t.viewer.historyLimitProceed}
          cancelLabel={t.viewer.historyLimitCancel}
          onProceed={() => answerHistoryGuard(true)}
          onCancel={() => answerHistoryGuard(false)}
        />
      )}

      {openFailure && <OpenFailurePrompt failure={openFailure} />}

      <PrivacyBadge />
    </div>
  )
}
