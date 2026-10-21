/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { useRef, useState } from 'react'
import { FileImage, FileUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDocument } from '../../document/documentSession'
import { t } from '../../i18n/ja'
import { toUserMessage } from '../../utils/userMessage'
import { openPdfFile } from './openPdf'
import NewImagePdfScreen from './NewImagePdfScreen'
import OpenFailurePrompt from './OpenFailurePrompt'
import { appendImageFiles, type ImageDraft } from './newImagePdf'
import PrivacyBadge from '../tools/shared/PrivacyBadge'

/**
 * 起動直後の「PDFを開く」画面。
 *
 * ドラッグ＆ドロップは、この画面では受け付けない。
 * 土台（Layout.tsx）が画面全体でドロップを受けており、そちらが
 * 「ドラッグ中」の表示の出し入れも担当している。ここで二重に受けて
 * 途中で止めると、土台側の表示が消えなくなる（実際にそうなった）。
 */
export default function OpenDocumentScreen() {
  const { openDocument, openFailure, isBusy } = useDocument()
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [initialImages, setInitialImages] = useState<ImageDraft[] | null>(null)
  const [isReadingImages, setIsReadingImages] = useState(false)

  if (initialImages) {
    return <NewImagePdfScreen initialImages={initialImages} onCancel={() => setInitialImages(null)} />
  }

  const chooseImages = async (files: File[]) => {
    setIsReadingImages(true)
    try {
      const images = await appendImageFiles([], files, (_file, bytes) => {
        const type = bytes[0] === 0x89 ? 'image/png' : 'image/jpeg'
        return URL.createObjectURL(new Blob([bytes.slice().buffer], { type }))
      })
      setInitialImages(images)
    } catch (err) {
      console.error(err)
      toast.error(toUserMessage(err))
    } finally {
      setIsReadingImages(false)
    }
  }

  const processing = isBusy || isReadingImages

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <input
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        ref={pdfInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = '' // 同じファイルを続けて選べるようにする
          if (file) openPdfFile(file, openDocument)
        }}
      />
      <input
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
        className="hidden"
        ref={imageInputRef}
        onChange={(event) => {
          // FileList は入力欄に結び付いたままのため、先に普通の配列へ控える。
          // value を空にした後で FileList を読むと、選んだ画像まで0件になるブラウザーがある。
          const files = event.target.files ? Array.from(event.target.files) : []
          event.target.value = ''
          if (files.length) void chooseImages(files)
        }}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => !processing && pdfInputRef.current?.click()}
          disabled={processing}
          className="group rounded-[2rem] border-4 border-dashed border-gray-200 p-8 text-left transition-all hover:border-rose-200 hover:bg-rose-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-rose-900/10"
        >
          <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500 transition-transform group-hover:scale-105 dark:bg-rose-900/20">
            {isBusy ? <Loader2 size={30} className="animate-spin" /> : <FileUp size={30} />}
          </span>
          <span className="block text-xl font-black text-gray-800 dark:text-white">{t.viewer.openTitle}</span>
          <span className="mt-2 block text-sm leading-relaxed text-gray-500 dark:text-zinc-400">
            {t.viewer.openPdfChoiceHint}
          </span>
        </button>

        <button
          type="button"
          onClick={() => !processing && imageInputRef.current?.click()}
          disabled={processing}
          className="group rounded-[2rem] border-4 border-dashed border-gray-200 p-8 text-left transition-all hover:border-sky-200 hover:bg-sky-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-sky-900/10"
        >
          <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sky-50 text-sky-500 transition-transform group-hover:scale-105 dark:bg-sky-900/20">
            {isReadingImages ? <Loader2 size={30} className="animate-spin" /> : <FileImage size={30} />}
          </span>
          <span className="block text-xl font-black text-gray-800 dark:text-white">{t.viewer.newFromImages}</span>
          <span className="mt-2 block text-sm leading-relaxed text-gray-500 dark:text-zinc-400">
            {t.viewer.newFromImagesHint}
          </span>
        </button>
      </div>

      <p className="mt-5 text-center text-xs font-medium text-gray-400">{t.viewer.openHint}</p>

      <PrivacyBadge />
      {openFailure && <OpenFailurePrompt failure={openFailure} />}
    </div>
  )
}
