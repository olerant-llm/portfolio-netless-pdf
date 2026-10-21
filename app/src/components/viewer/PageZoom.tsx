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
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, PenTool } from 'lucide-react'
import { toast } from 'sonner'

import { useDocument } from '../../document/documentSession'
import {
  detectSignatureImageKind,
  MAX_SIGNATURE_IMAGE_BYTES,
  signatureOperation,
  VisibleSignaturePlacement,
} from '../../operations/signatureOp'
import { renderPageThumbnail } from '../../utils/pdfHelpers'
import { toUserMessage } from '../../utils/userMessage'
import { t } from '../../i18n/ja'

interface PageZoomProps {
  pdfDoc: any
  totalPages: number
  /** 最初に表示するページ（1始まり） */
  startPage: number
  /** ページ操作から開いた場合は、最初から署名画像の配置画面にする */
  startInSignatureMode?: boolean
  onClose: () => void
}

/**
 * ページの拡大表示。中身を確かめるための副画面。
 *
 * 1ページずつ表示する。200ページぶんを高精細で同時に持つとメモリを食うため、
 * 「並べて読む」のではなく「1枚ずつ確かめる」作りにしてある。
 */
export default function PageZoom({
  pdfDoc, totalPages, startPage, startInSignatureMode = false, onClose,
}: PageZoomProps) {
  const { doc, applyOperation, isBusy, signatureWarningStatus, historyWarningDrops } = useDocument()
  const [pageNum, setPageNum] = useState(startPage)
  const [src, setSrc] = useState<string | null>(null)
  const [signatureMode, setSignatureMode] = useState(startInSignatureMode)
  const [signatureBytes, setSignatureBytes] = useState<Uint8Array | null>(null)
  const [signatureSrc, setSignatureSrc] = useState<string | null>(null)
  const [imageAspect, setImageAspect] = useState<number | null>(null)
  const [paperAspect, setPaperAspect] = useState<number | null>(null)
  const [placement, setPlacement] = useState<VisibleSignaturePlacement>({
    left: 0.35,
    top: 0.65,
    width: 0.3,
  })
  const signatureInputRef = useRef<HTMLInputElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const signatureRef = useRef<HTMLImageElement>(null)
  const signatureUrlRef = useRef<string | null>(null)
  const dragRef = useRef<{ pointerId: number, offsetX: number, offsetY: number } | null>(null)

  const previewWidth = imageAspect && paperAspect
    ? Math.min(placement.width, paperAspect / imageAspect)
    : placement.width
  const previewHeight = imageAspect && paperAspect
    ? previewWidth * imageAspect / paperAspect
    : 0

  const clearSignature = () => {
    if (signatureUrlRef.current) URL.revokeObjectURL(signatureUrlRef.current)
    signatureUrlRef.current = null
    setSignatureSrc(null)
    setSignatureBytes(null)
    setImageAspect(null)
  }

  useEffect(() => () => {
    if (signatureUrlRef.current) URL.revokeObjectURL(signatureUrlRef.current)
  }, [])

  useEffect(() => {
    setPlacement((current) => {
      const left = Math.min(current.left, Math.max(0, 1 - previewWidth))
      const top = Math.min(current.top, Math.max(0, 1 - previewHeight))
      return left === current.left && top === current.top ? current : { ...current, left, top }
    })
  }, [previewHeight, previewWidth])

  useEffect(() => {
    let alive = true
    setSrc(null)
    renderPageThumbnail(pdfDoc, pageNum, 2.0).then((url) => {
      if (alive) setSrc(url || null)
    })
    return () => {
      alive = false
    }
  }, [pdfDoc, pageNum])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (signatureWarningStatus || historyWarningDrops !== null) return
      if (e.key === 'Escape') onClose()
      if (e.target instanceof HTMLElement && e.target.matches('input, button, select, textarea')) return
      if (e.key === 'ArrowRight') setPageNum((n) => Math.min(n + 1, totalPages))
      if (e.key === 'ArrowLeft') setPageNum((n) => Math.max(n - 1, 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, signatureWarningStatus, historyWarningDrops, totalPages])

  const chooseSignature = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_SIGNATURE_IMAGE_BYTES) {
      toast.error(t.viewer.signatureImageFileTooLarge)
      if (signatureInputRef.current) signatureInputRef.current.value = ''
      return
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const kind = detectSignatureImageKind(bytes)
      if (signatureUrlRef.current) URL.revokeObjectURL(signatureUrlRef.current)
      const url = URL.createObjectURL(new Blob(
        [bytes.slice().buffer],
        { type: kind === 'png' ? 'image/png' : 'image/jpeg' },
      ))
      signatureUrlRef.current = url
      setSignatureBytes(bytes)
      setSignatureSrc(url)
      setImageAspect(null)
      setPlacement({ left: 0.35, top: 0.65, width: 0.3 })
    } catch (err) {
      console.error(err)
      toast.error(toUserMessage(err))
      clearSignature()
    } finally {
      if (signatureInputRef.current) signatureInputRef.current.value = ''
    }
  }

  const moveSignature = (leftPixels: number, topPixels: number) => {
    const paper = paperRef.current?.getBoundingClientRect()
    const signature = signatureRef.current?.getBoundingClientRect()
    if (!paper || !signature || paper.width <= 0 || paper.height <= 0) return
    setPlacement((current) => ({
      ...current,
      left: Math.max(0, Math.min(paper.width - signature.width, leftPixels)) / paper.width,
      top: Math.max(0, Math.min(paper.height - signature.height, topPixels)) / paper.height,
    }))
  }

  const handlePaperClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!signatureRef.current || event.target === signatureRef.current) return
    const paper = event.currentTarget.getBoundingClientRect()
    const signature = signatureRef.current.getBoundingClientRect()
    moveSignature(
      event.clientX - paper.left - signature.width / 2,
      event.clientY - paper.top - signature.height / 2,
    )
  }

  const startDragging = (event: React.PointerEvent<HTMLImageElement>) => {
    const signature = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - signature.left,
      offsetY: event.clientY - signature.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.stopPropagation()
  }

  const dragSignature = (event: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current
    const paper = paperRef.current?.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !paper) return
    moveSignature(
      event.clientX - paper.left - drag.offsetX,
      event.clientY - paper.top - drag.offsetY,
    )
  }

  const finishDragging = (event: React.PointerEvent<HTMLImageElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const applySignature = async () => {
    const pageId = doc?.pageIds[pageNum - 1]
    if (!signatureBytes || !pageId) return
    try {
      const applied = await applyOperation((input) => signatureOperation(input, {
        pageId,
        imageBytes: signatureBytes,
        placement,
      }))
      if (applied) {
        toast.success(t.viewer.signatureImageAppliedToast)
        clearSignature()
        setSignatureMode(false)
      }
    } catch (err) {
      console.error(err)
      toast.error(toUserMessage(err))
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[500] bg-zinc-950 flex flex-col animate-in fade-in duration-200">
      <header className="flex items-center justify-between px-4 py-3 bg-zinc-900/95 backdrop-blur-xl border-b border-white/5">
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
          aria-label={t.common.close}
        >
          <X size={22} strokeWidth={2.5} />
        </button>
        <div className="flex items-center gap-3">
          <div className="text-xs font-bold text-zinc-400 tracking-widest">
            {pageNum} / {totalPages}
          </div>
          <button
            type="button"
            onClick={() => setSignatureMode((current) => !current)}
            disabled={isBusy}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all disabled:opacity-30 ${
              signatureMode ? 'bg-rose-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
            }`}
          >
            <PenTool size={15} />
            {t.viewer.signatureImageHeading}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPageNum((n) => Math.max(n - 1, 1))}
            disabled={pageNum <= 1}
            className="w-10 h-10 flex items-center justify-center bg-white/5 text-zinc-300 rounded-2xl hover:bg-white/10 transition-all disabled:opacity-30"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => setPageNum((n) => Math.min(n + 1, totalPages))}
            disabled={pageNum >= totalPages}
            className="w-10 h-10 flex items-center justify-center bg-white/5 text-zinc-300 rounded-2xl hover:bg-white/10 transition-all disabled:opacity-30"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto flex items-start justify-center p-6">
        {src ? (
          <div
            ref={paperRef}
            onClick={signatureMode && signatureSrc ? handlePaperClick : undefined}
            className={`relative w-fit max-w-full bg-white shadow-2xl rounded-sm ${
              signatureMode && signatureSrc ? 'cursor-crosshair' : ''
            }`}
          >
            <img
              src={src}
              alt={`${pageNum}${t.common.pages}`}
              onLoad={(event) => setPaperAspect(
                event.currentTarget.naturalHeight / event.currentTarget.naturalWidth,
              )}
              className="block max-w-full h-auto object-contain"
            />
            {signatureMode && signatureSrc && (
              <img
                ref={signatureRef}
                src={signatureSrc}
                alt={t.viewer.signatureImageHeading}
                draggable={false}
                onLoad={(event) => setImageAspect(
                  event.currentTarget.naturalHeight / event.currentTarget.naturalWidth,
                )}
                onError={() => {
                  toast.error(t.viewer.signatureImagePreviewFailed)
                  clearSignature()
                }}
                onPointerDown={startDragging}
                onPointerMove={dragSignature}
                onPointerUp={finishDragging}
                onPointerCancel={finishDragging}
                style={{
                  left: `${placement.left * 100}%`,
                  top: `${placement.top * 100}%`,
                  width: `${previewWidth * 100}%`,
                }}
                className="absolute touch-none cursor-move select-none rounded-sm ring-2 ring-rose-500 ring-offset-2 ring-offset-zinc-950"
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 mt-32">
            <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
            <p className="text-xs font-bold text-zinc-600">{t.common.processing}</p>
          </div>
        )}
      </main>

      {signatureMode && (
        <footer className="border-t border-white/5 bg-zinc-900/95 px-5 py-4 text-white backdrop-blur-xl">
          <input
            ref={signatureInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,image/png,image/jpeg"
            className="hidden"
            onChange={(event) => chooseSignature(event.target.files?.[0])}
          />
          <div className="mx-auto flex max-w-5xl flex-col gap-3 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-zinc-200">{t.viewer.signatureImageDisclaimer}</p>
              {signatureSrc && (
                <p className="mt-1 text-[11px] text-zinc-400">{t.viewer.signatureImagePositionHint}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => signatureInputRef.current?.click()}
              disabled={isBusy}
              className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-bold hover:bg-white/15 disabled:opacity-30"
            >
              <ImageIcon size={16} />
              {signatureSrc ? t.viewer.signatureImageReplace : t.viewer.signatureImageChoose}
            </button>
            {signatureSrc && (
              <>
                <label className="flex min-w-52 items-center gap-3 text-xs font-bold text-zinc-300">
                  {t.viewer.signatureImageSize}
                  <input
                    type="range"
                    min={5}
                    max={80}
                    value={Math.round(placement.width * 100)}
                    disabled={isBusy}
                    onChange={(event) => setPlacement((current) => ({
                      ...current,
                      width: Number(event.target.value) / 100,
                    }))}
                    className="flex-1 accent-rose-500"
                  />
                  <span className="w-9 text-right">{Math.round(placement.width * 100)}%</span>
                </label>
                <button
                  type="button"
                  onClick={applySignature}
                  disabled={isBusy}
                  className="flex items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 py-3 text-xs font-black hover:bg-rose-600 disabled:opacity-30"
                >
                  {isBusy ? <Loader2 size={16} className="animate-spin" /> : <PenTool size={16} />}
                  {t.viewer.signatureImageApply}
                </button>
              </>
            )}
          </div>
        </footer>
      )}
    </div>,
    document.body
  )
}
